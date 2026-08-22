export const MAX_EVIDENCE_BYTES = 1_048_576
export const MAX_TEXT_BYTES = 256_000
export const MAX_EVIDENCE_ITEMS = 1_000

export function limitText(value: unknown, maxBytes = MAX_TEXT_BYTES): string {
  const text = typeof value === 'string' ? value : String(value ?? '')
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes <= maxBytes) return text
  return `${Buffer.from(text, 'utf8').subarray(0, maxBytes).toString('utf8')}\n[TRUNCATED]`
}

export function limitList<T>(items: readonly T[]): T[] {
  return items.length > MAX_EVIDENCE_ITEMS ? [...items.slice(0, MAX_EVIDENCE_ITEMS)] : [...items]
}

export function limitEvidence<T>(value: T): T {
  try {
    const serialized = JSON.stringify(value)
    if (serialized && Buffer.byteLength(serialized, 'utf8') <= MAX_EVIDENCE_BYTES) return value
    return { truncated: true, bytes: serialized ? Buffer.byteLength(serialized, 'utf8') : 0 } as T
  } catch {
    return { truncated: true, reason: 'evidence-not-serializable' } as T
  }
}
