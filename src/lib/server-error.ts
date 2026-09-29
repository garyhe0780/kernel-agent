/** Deadlocks and serialization failures roll back the whole transaction, so the request can be retried.
 * Prisma reports them as P2034, or as P2010 with the driver adapter's cause when raised by a raw query. */
export function isWriteConflict(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const value = error as { code?: unknown; meta?: { driverAdapterError?: { cause?: { kind?: unknown; originalCode?: unknown } } } }
  const cause = value.meta?.driverAdapterError?.cause
  return value.code === 'P2034' || cause?.kind === 'TransactionWriteConflict' || cause?.originalCode === '40P01' || cause?.originalCode === '40001'
}

export const writeConflictMessage = 'Another change was saved at the same time. Refresh and try again.'

/** Log only diagnostic codes and schema identifiers, never Prisma messages,
 * query arguments, connection strings, request bodies, or record values. */
export function serverErrorDetails(error: unknown) {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const meta = value.meta && typeof value.meta === 'object' ? value.meta as Record<string, unknown> : {}
  const identifier = (input: unknown) => typeof input === 'string' && /^[A-Za-z_][A-Za-z0-9_."]{0,159}$/.test(input) ? input : undefined
  return {
    name: value.name === 'PrismaClientKnownRequestError' || value.name === 'PrismaClientUnknownRequestError' || value.name === 'PrismaClientInitializationError' ? value.name : 'ServerError',
    code: typeof value.code === 'string' && /^P\d{4}$/.test(value.code) ? value.code : undefined,
    model: identifier(meta.modelName),
    table: identifier(meta.table),
    column: identifier(meta.column),
  }
}
