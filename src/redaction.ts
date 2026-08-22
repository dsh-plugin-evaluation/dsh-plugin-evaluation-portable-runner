export function redactSecrets<T>(value: T, secrets: readonly string[]): T {
  const seen = new WeakSet<object>()
  const visit = (current: unknown): unknown => {
    if (typeof current === 'string') return secrets.reduce((text, secret) => secret ? text.split(secret).join('[REDACTED]') : text, current)
    if (!current || typeof current !== 'object') return current
    if (seen.has(current)) return '[CIRCULAR]'
    seen.add(current)
    if (Array.isArray(current)) return current.map(visit)
    return Object.fromEntries(Object.entries(current).map(([key, item]) => [key, visit(item)]))
  }
  return visit(value) as T
}
