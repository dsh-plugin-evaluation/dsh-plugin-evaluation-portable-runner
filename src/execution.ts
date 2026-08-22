import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { failedCheck } from './errors.js'
import { redactSecrets } from './redaction.js'
import { createWorkspace, filesUnder } from './workspace.js'
import { limitEvidence, limitList, limitText } from './limits.js'
import { validatePortableCasePlan } from './validation.js'
import { createMetricRegistry } from './metrics.js'
import { createStepRegistry, registerBuiltinSteps } from './steps.js'
import { createMockNetwork, createMockTools, createTemporaryDatabase } from './adapters.js'
import type { PortableCheck } from './contracts.js'

export type AnyRecord = Record<string, any>
export type RunOptions = {
  plan?: AnyRecord
  runPlugin?: (request: AnyRecord) => Promise<AnyRecord> | AnyRecord
  baseEnvironment?: Record<string, string>
  provenance?: Record<string, unknown>
  secrets?: string[]
  fixtures?: any[]
  stepRegistry?: ReturnType<typeof createStepRegistry>
  metricRegistry?: ReturnType<typeof createMetricRegistry>
  tools?: ReturnType<typeof createMockTools>
  network?: ReturnType<typeof createMockNetwork>
  database?: ReturnType<typeof createTemporaryDatabase>
  limits?: { readonly timeoutMs?: number; readonly maxSteps?: number; readonly maxMetrics?: number }
  errorMode?: 'throw' | 'report'
}

async function runSetup(root: string, setup: readonly AnyRecord[], environment: Record<string, string>, stepRegistry: ReturnType<typeof createStepRegistry>) {
  for (const action of setup) await stepRegistry.run(action, { root, environment, workspace: createWorkspace(root) })
}

/**
 * Execute one validated plan in a temporary workspace.
 *
 * @remarks The callback is supplied by the host and receives the isolated
 * workspace, environment, prompt input, and session history.
 * @returns A bounded case report with checks and redacted evidence.
 * @throws {Error} When validation, limits, setup, or plugin execution fails
 * in the default `throw` error mode.
 */
export async function runPortableCasePlan({ plan, runPlugin, baseEnvironment = {}, provenance = {}, secrets = [], fixtures = [], stepRegistry = createStepRegistry(), metricRegistry = createMetricRegistry(), tools = createMockTools(), network = createMockNetwork(), database = createTemporaryDatabase(), limits = {}, errorMode = 'throw' }: RunOptions = {}) {
  if (!plan || typeof plan !== 'object') throw new Error('portable case plan is required')
  if (typeof runPlugin !== 'function') throw new Error('portable case plan runPlugin is required')
  const executable = validatePortableCasePlan(plan)
  for (const [name, value] of Object.entries(limits)) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw new Error(`portable case limit ${name} must be a positive number`)
  }
  if (limits.maxSteps !== undefined && executable.steps.length > limits.maxSteps) throw new Error(`portable case steps exceed limit: ${limits.maxSteps}`)
  if (limits.maxMetrics !== undefined && executable.metrics.length > limits.maxMetrics) throw new Error(`portable case metrics exceed limit: ${limits.maxMetrics}`)
  const availableFixtureIds = new Set(fixtures.map(fixture => fixture.id))
  const missingFixtures = (executable.fixtures ?? []).filter((id: string) => !availableFixtureIds.has(id))
  if (missingFixtures.length > 0) throw new Error(`portable case fixtures are not registered: ${missingFixtures.join(', ')}`)
  const root = await mkdtemp(resolve(tmpdir(), 'dsh-portable-case-'))
  const environment = { ...baseEnvironment }
  const workspace = createWorkspace(root)
  const runId = randomUUID()
  const startedAt = Date.now()
  const activeFixtures = fixtures.filter(fixture => executable.fixtures?.includes(fixture.id) || executable.fixtures === undefined)
  const preparedFixtures = []
  const environmentApi = { set: (name: string, value: string) => { environment[name] = value } }
  const context = { root, environment: environmentApi, workspace, runId }
  let primaryError
  try {
    for (const fixture of activeFixtures) { await fixture.setup(context); preparedFixtures.push(fixture) }
    registerBuiltinSteps(stepRegistry)
    const value: AnyRecord = { root, environment, workspace, executions: [] as AnyRecord[], session: { id: runId, messages: [] as AnyRecord[] }, tools, network, database, runPlugin, limits, toolCallStart: tools.calls.length, networkRequestStart: network.requests.length }
    let executionError: unknown
    try {
      await runSetup(root, executable.setup ?? [], environment, stepRegistry)
      for (const step of executable.steps) {
        if (step.op === 'plugin.prompt') value.session.messages.push({ role: 'user', content: step.input })
        await stepRegistry.run(step, value)
        if (step.op === 'plugin.prompt') value.session.messages.push({ role: 'assistant', content: value.executions.at(-1)?.output ?? '' })
      }
    } catch (error) {
      executionError = error
      if (errorMode === 'throw') throw error
      value.executions.push({ output: '', exitCode: 1, error: error instanceof Error ? error.message : String(error) })
    }
    const execution: AnyRecord = value.executions.at(-1) ?? {}
    const output = typeof execution.output === 'string' ? execution.output : String(execution.output ?? '')
    const files = execution.files ?? await filesUnder(root)
    const toolCalls = tools.calls.slice(value.toolCallStart)
    const networkRequests = network.requests.slice(value.networkRequestStart)
    const evidence = { output, files, executions: value.executions, session: value.session, toolCalls, networkRequests, database, execution }
    const checks: PortableCheck[] = executionError === undefined ? [] : [failedCheck('execution-failed', `插件执行失败: ${executionError instanceof Error ? executionError.message : String(executionError)}`, { code: 'execution-failed' })]
    for (const metric of executable.metrics) {
      try { checks.push(await metricRegistry.evaluate(metric, { ...evidence, evidence, secrets })) }
      catch (error) { checks.push(failedCheck(metric.id, `评测指标执行失败: ${error instanceof Error ? error.message : String(error)}`, { type: metric.type, code: 'metric-evaluation-failed' })) }
    }
    const reasons = checks.filter(item => !item.passed).map(item => item.reason)
    const status = reasons.length === 0 ? 'passed' : 'failed'
    const finishedAt = Date.now()
    return { reportSchemaVersion: 1, reportId: runId, runId, status, reasons, checks, actualOutput: limitText(redactSecrets(output, secrets)), exitCode: execution.exitCode ?? 0, durationMs: finishedAt - startedAt, startedAt, finishedAt, summary: { status, totalCases: 1, passedCases: status === 'passed' ? 1 : 0, failedCases: status === 'failed' ? 1 : 0 }, provenance: { schemeId: plan.id, schemeVersion: plan.schemaVersion, ...provenance }, evidence: limitEvidence(redactSecrets({ files: limitList(files), toolCalls: limitList(toolCalls), networkRequests: limitList(networkRequests), timedOut: execution.timedOut === true, messages: limitList(value.session.messages), stdout: limitText(execution.stdout ?? ''), stderr: limitText(execution.stderr ?? ''), exitCode: execution.exitCode ?? 0 }, secrets)) }
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    let cleanupError
    try { for (const fixture of [...preparedFixtures].reverse()) await fixture.teardown(context) }
    catch (error) { cleanupError = error }
    finally { try { await rm(root, { recursive: true, force: true }) } catch (error) { cleanupError ??= error } }
    if (cleanupError && !primaryError) throw cleanupError
  }
}
