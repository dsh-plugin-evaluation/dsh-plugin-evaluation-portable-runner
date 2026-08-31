export type PortableStep = Readonly<Record<string, unknown>> & { readonly op: string }

export class PortableRunnerError extends Error {
  readonly code: string
}

export type PortableMetric = Readonly<Record<string, unknown>> & {
  readonly id: string
  readonly type: string
  readonly weight?: number
  readonly required?: boolean
  readonly passScore?: number
}

export interface PortableScoringPolicy {
  readonly method?: 'weighted-average'
  readonly passScore?: number
  readonly weights?: Readonly<Record<string, number>>
  readonly required?: readonly string[]
}

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

export interface PortablePluginExecution {
  readonly output?: unknown
  readonly stdout?: string
  readonly stderr?: string
  readonly exitCode?: number
  readonly timedOut?: boolean
  readonly files?: readonly string[]
  readonly toolCalls?: readonly (string | Readonly<{ readonly name: string }> )[]
}

export interface PortableCaseResult {
  readonly reportSchemaVersion: 1
  readonly reportId: string
  readonly runId: string
  readonly status: 'passed' | 'failed'
  readonly reasons: readonly string[]
  readonly checks: readonly { readonly id: string; readonly passed: boolean; readonly score: number; readonly weight: number; readonly required: boolean; readonly reason?: string; readonly confidence?: number; readonly details?: Readonly<Record<string, unknown>> }[]
  readonly score: { readonly value: number; readonly scale: '0..1'; readonly passScore?: number; readonly totalWeight: number; readonly requiredPassed: boolean; readonly passed: boolean }
  readonly actualOutput: string
  readonly exitCode: number
  readonly durationMs: number
  readonly startedAt: number
  readonly finishedAt: number
  readonly summary: { readonly status: 'passed' | 'failed'; readonly totalCases: number; readonly passedCases: number; readonly failedCases: number }
  readonly provenance: Readonly<Record<string, unknown>>
  readonly evidence: Readonly<Record<string, unknown>>
}

export interface PortableMockTools {
  readonly calls: readonly Readonly<Record<string, unknown>>[]
  readonly register: (name: string, handler: (argumentsValue: Readonly<Record<string, unknown>>) => unknown) => PortableMockTools
  readonly call: (name: string, argumentsValue?: Readonly<Record<string, unknown>>) => Promise<unknown>
}

export interface PortableMockNetwork {
  readonly requests: readonly Readonly<Record<string, unknown>>[]
  readonly request: (url: string, options?: Readonly<Record<string, unknown>>) => Promise<unknown>
}

export interface PortableTemporaryDatabase {
  readonly get: (key: string) => Promise<unknown>
  readonly set: (key: string, value: unknown) => Promise<void>
  readonly delete: (key: string) => Promise<void>
  readonly clear: () => Promise<void>
}

export interface PortableRunLimits {
  readonly timeoutMs?: number
  readonly maxSteps?: number
  readonly maxMetrics?: number
}

export type PortableErrorMode = 'throw' | 'report'

export interface PortableRunnerContext {
  readonly root: string
  readonly environment: { readonly set: (name: string, value: string) => void }
  readonly workspace: { readonly write: (path: string, content: string) => Promise<void>; readonly read: (path: string) => Promise<string> }
  readonly runId: string
}

export interface PortableFixture {
  readonly id: string
  readonly setup: (context: PortableRunnerContext) => Promise<void> | void
  readonly teardown: (context: PortableRunnerContext) => Promise<void> | void
}

export interface PortableCase {
  readonly schemaVersion: 1
  readonly id: string
  readonly title: string
  readonly fixtures: readonly string[]
  readonly setup: readonly PortableStep[]
  readonly steps: readonly PortableStep[]
  readonly metrics: readonly PortableMetric[]
  readonly scoring?: PortableScoringPolicy
}

export interface PortableSuite {
  readonly schemaVersion: 1
  readonly id: string
  readonly version: string
  readonly fixtures: readonly PortableFixture[]
  readonly cases: readonly PortableCase[]
}

export interface PortableCaseProgress {
  readonly caseId: string
  readonly title: string
  readonly index: number
  readonly total: number
  readonly result?: PortableCaseResult
}

export interface PortableSuiteRunOptions {
  readonly onCaseStart?: (progress: Omit<PortableCaseProgress, 'result'>) => void | Promise<void>
  readonly onCaseComplete?: (progress: PortableCaseProgress) => void | Promise<void>
}

export function runSuite(options: {
  readonly suite: PortableSuite
  readonly runPlugin: (input: unknown) => Promise<PortablePluginExecution>
  readonly reporters?: Readonly<Record<string, (report: unknown) => unknown | Promise<unknown>>>
  readonly onCaseStart?: PortableSuiteRunOptions['onCaseStart']
  readonly onCaseComplete?: PortableSuiteRunOptions['onCaseComplete']
}): Promise<Readonly<Record<string, unknown>>>

export function defineFixture(input: {
  readonly id: string
  readonly setup: (context: PortableRunnerContext) => Promise<void> | void
  readonly teardown?: (context: PortableRunnerContext) => Promise<void> | void
}): PortableFixture

export function validatePortableCasePlan(plan: PortableCasePlan): PortableCasePlan
export function validatePortableSuite(suite: PortableSuite): PortableSuite

export function defineCase(input: {
  readonly id: string
  readonly title?: string
  readonly fixtures?: readonly string[]
  readonly setup?: readonly PortableStep[]
  readonly steps?: readonly PortableStep[]
  readonly metrics?: readonly PortableMetric[]
  readonly scoring?: PortableScoringPolicy
}): PortableCase

export function defineSuite(input: {
  readonly id: string
  readonly version?: string
  readonly fixtures?: readonly PortableFixture[]
  readonly cases?: readonly PortableCase[]
}): PortableSuite

export function createStepRegistry(custom?: Readonly<Record<string, (step: PortableStep, context: Readonly<Record<string, unknown>>) => unknown>>): {
  readonly register: (type: string, handler: (step: PortableStep, context: Readonly<Record<string, unknown>>) => unknown) => unknown
  readonly has: (type: string) => boolean
  readonly run: (step: PortableStep, context: Readonly<Record<string, unknown>>) => Promise<unknown>
  readonly types: () => readonly string[]
}

export function createMetricRegistry(custom?: Readonly<Record<string, (context: Readonly<Record<string, unknown>>) => boolean | number | Readonly<{ score?: number; passed?: boolean; reason?: string; confidence?: number; details?: Readonly<Record<string, unknown>> }> | Promise<boolean | number | Readonly<{ score?: number; passed?: boolean; reason?: string; confidence?: number; details?: Readonly<Record<string, unknown>> >>>>): {
  readonly register: (type: string, evaluator: (context: Readonly<Record<string, unknown>>) => boolean | number | Readonly<{ score?: number; passed?: boolean; reason?: string; confidence?: number; details?: Readonly<Record<string, unknown>> }> | Promise<boolean | number | Readonly<{ score?: number; passed?: boolean; reason?: string; confidence?: number; details?: Readonly<Record<string, unknown>> >>>) => unknown
  readonly has: (type: string) => boolean
  readonly evaluate: (metric: PortableMetric, context: Readonly<Record<string, unknown>>) => Readonly<Record<string, unknown>>
  readonly types: () => readonly string[]
}

export function createMockTools(definitions?: Readonly<Record<string, (argumentsValue: Readonly<Record<string, unknown>>) => unknown>>): PortableMockTools
export function createMockNetwork(routes?: Readonly<Record<string, unknown>>): PortableMockNetwork
export function createTemporaryDatabase(): PortableTemporaryDatabase
export function createReporterRegistry(custom?: Readonly<Record<string, (report: Readonly<Record<string, unknown>>) => unknown>>): {
  readonly register: (name: string, reporter: (report: Readonly<Record<string, unknown>>) => unknown) => unknown
  readonly render: (name: string, report: Readonly<Record<string, unknown>>) => Promise<string>
  readonly types: () => readonly string[]
}

export function runPortableCasePlan(options: {
  readonly plan: PortableCasePlan
  readonly runPlugin: (context: { readonly input: string; readonly cwd: string; readonly env: Readonly<Record<string, string>>; readonly session: Readonly<Record<string, unknown>>; readonly signal: AbortSignal }) => Promise<PortablePluginExecution>
  readonly baseEnvironment?: Readonly<Record<string, string>>
  readonly provenance?: Readonly<Record<string, unknown>>
  readonly secrets?: readonly string[]
  readonly fixtures?: readonly PortableFixture[]
  readonly stepRegistry?: ReturnType<typeof createStepRegistry>
  readonly metricRegistry?: ReturnType<typeof createMetricRegistry>
  readonly judge?: (input: { readonly metric: Readonly<Record<string, unknown>>; readonly expected: unknown; readonly actual: unknown; readonly evidence: unknown; readonly signal: AbortSignal }) => Readonly<Record<string, unknown>> | Promise<Readonly<Record<string, unknown>>>
  readonly tools?: PortableMockTools
  readonly network?: PortableMockNetwork
  readonly database?: PortableTemporaryDatabase
  readonly limits?: PortableRunLimits
  readonly errorMode?: PortableErrorMode
}): Promise<PortableCaseResult>

export function runSuite(options: {
  readonly suite: PortableSuite
  readonly runPlugin: Parameters<typeof runPortableCasePlan>[0]['runPlugin']
  readonly reporters?: Readonly<Record<string, (report: Readonly<Record<string, unknown>>) => Promise<void> | void>>
  readonly baseEnvironment?: Readonly<Record<string, string>>
  readonly secrets?: readonly string[]
  readonly stepRegistry?: ReturnType<typeof createStepRegistry>
  readonly metricRegistry?: ReturnType<typeof createMetricRegistry>
  readonly tools?: PortableMockTools
  readonly network?: PortableMockNetwork
  readonly database?: PortableTemporaryDatabase
  readonly judge?: (input: { readonly metric: Readonly<Record<string, unknown>>; readonly expected: unknown; readonly actual: unknown; readonly evidence: unknown; readonly signal: AbortSignal }) => Readonly<Record<string, unknown>> | Promise<Readonly<Record<string, unknown>>>
}): Promise<Readonly<Record<string, unknown>>>
