/** Public entry point for the host-independent Portable Runner API. */
import { randomUUID } from 'node:crypto'
import { validatePortableSuite } from './validation.js'
import { runPortableCasePlan } from './execution.js'

export { PortableRunnerError } from './errors.js'

export { validatePortableCasePlan, validatePortableSuite } from './validation.js'

export { createStepRegistry } from './steps.js'

export { createMetricRegistry } from './metrics.js'

export { createMockNetwork, createMockTools, createTemporaryDatabase } from './adapters.js'

export { createReporterRegistry } from './reporters.js'
export { runPortableCasePlan } from './execution.js'
export type { AnyRecord, RunOptions } from './execution.js'
export type { Call, Handler, NetworkHandler } from './adapters.js'
export type { Evaluator, MetricContext } from './metrics.js'
export type { Reporter } from './reporters.js'
export type { StepHandler } from './steps.js'
export type { PortableStatus, PortableStep, PortableMetric, PortableCasePlan, PortablePluginExecution, PortableCheck, PortableCaseReport } from './contracts.js'

/** Define reusable test data and environment setup. */
export function defineFixture({ id, setup, teardown = async () => {} }: any = {}) {
  if (typeof id !== 'string' || typeof setup !== 'function') throw new TypeError('fixture requires id and setup')
  return Object.freeze({ id, setup, teardown })
}

/** Define one evaluation scenario. */
export function defineCase({ id, title = id, fixtures = [], setup = [], steps = [], metrics = [] }: any = {}) {
  if (typeof id !== 'string') throw new TypeError('case requires id')
  return Object.freeze({ schemaVersion: 1, id, title, fixtures, setup, steps, metrics })
}

/** Group related cases and shared fixtures into a suite. */
export function defineSuite({ id, version = '1.0.0', fixtures = [], cases = [] }: any = {}) {
  if (typeof id !== 'string') throw new TypeError('suite requires id')
  return Object.freeze({ schemaVersion: 1, id, version, fixtures, cases })
}

export async function runSuite({ suite, runPlugin, reporters = {}, baseEnvironment = {}, secrets = [], stepRegistry, metricRegistry, tools, network, database }: any = {}) {
  validatePortableSuite(suite)
  const fixtures = suite.fixtures ?? []
  const cases = []
  for (const testCase of suite.cases) {
    cases.push(await runPortableCasePlan({ plan: testCase, runPlugin, fixtures, baseEnvironment, secrets, stepRegistry, metricRegistry, tools, network, database, provenance: { suiteId: suite.id, suiteVersion: suite.version, caseId: testCase.id } }))
  }
  const passed = cases.every(item => item.status === 'passed')
  const report = { reportSchemaVersion: 1, reportId: randomUUID(), suite: { id: suite.id, version: suite.version }, status: passed ? 'passed' : 'failed', cases, summary: { totalCases: cases.length, passedCases: cases.filter(item => item.status === 'passed').length, failedCases: cases.filter(item => item.status !== 'passed').length } }
  for (const reporter of Object.values(reporters) as Array<(value: unknown) => unknown | Promise<unknown>>) await reporter(report)
  return report
}
