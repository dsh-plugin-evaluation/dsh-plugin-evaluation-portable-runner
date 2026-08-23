/** Final status shared by case and suite reports. */
export type PortableStatus = 'passed' | 'failed'

/** One bounded operation executed during setup or plugin execution. */
export interface PortableStep {
  readonly op: string
  readonly [key: string]: unknown
}

/** One registered assertion evaluated against collected evidence. */
export interface PortableMetric {
  readonly id: string
  readonly type: string
  readonly weight?: number
  readonly required?: boolean
  readonly passScore?: number
  readonly [key: string]: unknown
}

export interface PortableScoringPolicy {
  readonly method?: 'weighted-average'
  readonly passScore?: number
  readonly weights?: Readonly<Record<string, number>>
  readonly required?: readonly string[]
}

/** A complete, host-independent evaluation scenario. */
export interface PortableCasePlan {
  readonly schemaVersion: 1
  readonly id: string
  readonly title?: string
  readonly fixtures?: readonly string[]
  readonly setup?: readonly PortableStep[]
  readonly steps: readonly PortableStep[]
  readonly metrics: readonly PortableMetric[]
  readonly scoring?: PortableScoringPolicy
}

/** Result returned by the host-owned plugin callback. */
export interface PortablePluginExecution {
  readonly output?: unknown
  readonly stdout?: string
  readonly stderr?: string
  readonly exitCode?: number
  readonly timedOut?: boolean
  readonly files?: readonly string[]
  readonly toolCalls?: readonly unknown[]
}

/** Result of evaluating one metric. */
export interface PortableCheck {
  readonly id: string
  readonly passed: boolean
  readonly score: number
  readonly weight: number
  readonly required: boolean
  readonly reason?: string
  readonly confidence?: number
  readonly details: Readonly<Record<string, unknown>>
}

export interface PortableScoreSummary {
  readonly value: number
  readonly scale: '0..1'
  readonly passScore?: number
  readonly totalWeight: number
  readonly requiredPassed: boolean
  readonly passed: boolean
}

/** Stable report returned for one executed case plan. */
export interface PortableCaseReport {
  readonly reportSchemaVersion: 1
  readonly reportId: string
  readonly runId: string
  readonly status: PortableStatus
  readonly reasons: readonly string[]
  readonly checks: readonly PortableCheck[]
  readonly score: PortableScoreSummary
  readonly actualOutput: string
  readonly exitCode: number
  readonly durationMs: number
  readonly startedAt: number
  readonly finishedAt: number
  readonly summary: {
    readonly status: PortableStatus
    readonly totalCases: 1
    readonly passedCases: 0 | 1
    readonly failedCases: 0 | 1
  }
  readonly provenance: Readonly<Record<string, unknown>>
  readonly evidence: Readonly<Record<string, unknown>>
}
