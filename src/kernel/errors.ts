export class KernelError extends Error {
  constructor(public code: string, message: string, public status = 400, public details?: unknown) { super(message) }
}

/** A validation failure whose message is written for the person or agent who supplied the input. */
export class InputError extends Error {
  override name = 'InputError'
}
