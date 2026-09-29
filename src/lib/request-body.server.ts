import { KernelError } from '../kernel/errors'

export const REQUEST_BODY_LIMIT = 128000

/** Reads the body incrementally so oversized requests are refused before they are buffered. */
export async function readBoundedText(request: Request, limit = REQUEST_BODY_LIMIT) {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) throw new KernelError('TOO_LARGE', 'Request exceeds the size limit.', 413)
  const reader = request.body?.getReader()
  if (!reader) return ''
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > limit) { await reader.cancel(); throw new KernelError('TOO_LARGE', 'Request exceeds the size limit.', 413) }
      chunks.push(next.value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(bytes)
}
