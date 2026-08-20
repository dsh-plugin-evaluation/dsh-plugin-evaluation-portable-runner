export interface PortableCasePlan {
  readonly schemaVersion?: number
  readonly id?: string
  readonly title?: string
  readonly setup: readonly Record<string, unknown>[]
  readonly run: { readonly op: 'plugin.prompt'; readonly input: string }
  readonly assertions: readonly { readonly op: 'output.equals' | 'output.contains' | 'output.notContains'; readonly value: string }[]
}

export interface PortablePluginExecution {
  readonly output?: unknown
  readonly exitCode?: number
}

export interface PortableCaseResult {
  readonly reportSchemaVersion: 1
  readonly reportId: string
  readonly runId: string
  readonly status: 'passed' | 'failed'
  readonly reasons: readonly string[]
  readonly checks: readonly { readonly id: string; readonly passed: boolean; readonly reason?: string }[]
  readonly actualOutput: string
  readonly exitCode: number
  readonly durationMs: number
  readonly startedAt: number
  readonly finishedAt: number
  readonly summary: { readonly status: 'passed' | 'failed'; readonly totalCases: number; readonly passedCases: number; readonly failedCases: number }
  readonly provenance: Readonly<Record<string, unknown>>
}

export function runPortableCasePlan(options: {
  readonly plan: PortableCasePlan
  readonly runPlugin: (context: { readonly input: string; readonly cwd: string; readonly env: Record<string, string> }) => Promise<PortablePluginExecution>
  readonly baseEnvironment?: Readonly<Record<string, string>>
  readonly provenance?: Readonly<Record<string, unknown>>
}): Promise<PortableCaseResult>
