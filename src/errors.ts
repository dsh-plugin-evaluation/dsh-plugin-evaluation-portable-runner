export class PortableRunnerError extends Error {
  readonly code: string

  constructor(message: string, code = 'portable-runner-error', options?: ErrorOptions) {
    super(message, options)
    this.name = 'PortableRunnerError'
    this.code = code
  }
}

export function failedCheck(id: string, reason: string, details: Record<string, unknown> = {}) {
  return { id, passed: false, reason, details }
}
