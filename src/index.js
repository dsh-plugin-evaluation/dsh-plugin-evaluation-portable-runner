import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'

function check(id, passed, reason, details = {}) {
  return { id, passed, ...(reason === undefined ? {} : { reason }), details }
}

function workspacePath(root, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath.includes('\0')) throw new Error('portable case workspace path is invalid')
  if (relativePath.startsWith('/') || relativePath.split('/').includes('..')) throw new Error('portable case workspace path must be relative')
  const path = resolve(root, relativePath)
  const boundary = root.endsWith(sep) ? root : `${root}${sep}`
  if (path !== root && !path.startsWith(boundary)) throw new Error('portable case workspace path escapes workspace')
  return path
}

async function filesUnder(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = resolve(current, entry.name)
    if (entry.isDirectory()) files.push(...await filesUnder(root, path))
    else files.push(path.slice(root.length + 1).split(sep).join('/'))
  }
  return files.sort()
}

function createWorkspace(root) {
  return {
    write: async (path, content) => {
      const target = workspacePath(root, path)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, content, 'utf8')
    },
    read: path => readFile(workspacePath(root, path), 'utf8'),
  }
}

export function validatePortableCasePlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new TypeError('portable case plan must be an object')
  if (plan.schemaVersion !== 1) throw new TypeError('portable case schemaVersion must be 1')
  if (typeof plan.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(plan.id)) throw new TypeError('portable case id must be kebab-case')
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) throw new TypeError('portable case steps must contain at least one item')
  if (!Array.isArray(plan.metrics) || plan.metrics.length === 0) throw new TypeError('portable case metrics must contain at least one item')
  const ids = new Set()
  for (const step of plan.steps) {
    if (!step || typeof step !== 'object' || typeof step.op !== 'string') throw new TypeError('portable case step must have an op')
    if (step.op === 'plugin.prompt' && (typeof step.input !== 'string' || step.input.trim() === '')) throw new TypeError('portable case prompt input must be non-empty')
  }
  for (const metric of plan.metrics) {
    if (!metric || typeof metric !== 'object' || typeof metric.id !== 'string' || typeof metric.type !== 'string') throw new TypeError('portable case metric must have id and type')
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(metric.id)) throw new TypeError('portable case metric id must be kebab-case')
    if (ids.has(metric.id)) throw new TypeError(`portable case metric ${metric.id} is duplicated`)
    ids.add(metric.id)
  }
  for (const action of [...(plan.setup ?? []), ...plan.steps]) {
    if (!action || typeof action !== 'object' || typeof action.op !== 'string') throw new TypeError('portable case action must have an op')
    if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(action.op)) throw new TypeError(`portable case action op is invalid: ${action.op}`)
    if (action.op === 'plugin.prompt' && (typeof action.input !== 'string' || action.input.trim() === '')) throw new TypeError('portable case prompt input must be non-empty')
    if (action.op === 'workspace.write' || action.op === 'workspace.read') {
      if (typeof action.path !== 'string' || action.path.length === 0) throw new TypeError('portable case workspace path is required')
    }
  }
  return plan
}

export function createStepRegistry(custom = {}) {
  const registry = new Map(Object.entries(custom))
  return {
    register(type, handler) {
      if (typeof type !== 'string' || typeof handler !== 'function') throw new TypeError('step registration is invalid')
      registry.set(type, handler)
      return this
    },
    has: type => registry.has(type),
    run: (step, context) => {
      const handler = registry.get(step.op)
      if (handler === undefined) throw new Error(`portable case step is unsupported: ${String(step.op)}`)
      return handler(step, context)
    },
    types: () => [...registry.keys()].sort(),
  }
}

export function createMetricRegistry(custom = {}) {
  const registry = new Map(Object.entries({
    'output.equals': ({ metric, output }) => output === metric.expected,
    'output.contains': ({ metric, output }) => output.includes(metric.expected),
    'output.notContains': ({ metric, output }) => !output.includes(metric.expected),
    'output-exact': ({ metric, output }) => output.trim() === metric.expected,
    'file-exists': ({ metric, files }) => files.includes(metric.path),
    'no-timeout': ({ execution }) => execution.timedOut !== true,
    'no-secret': ({ output, execution }) => !`${output}\n${execution.stdout ?? ''}\n${execution.stderr ?? ''}`.match(/(api[_ -]?key|secret|password|authorization|bearer)\s*[:=]/iu),
    'tool-calls': ({ metric, execution }) => (metric.expected ?? []).every(name => (execution.toolCalls ?? []).some(call => (typeof call === 'string' ? call : call?.name) === name)),
    ...custom,
  }))
  return {
    register(type, evaluator) {
      if (typeof type !== 'string' || typeof evaluator !== 'function') throw new TypeError('metric registration is invalid')
      registry.set(type, evaluator)
      return this
    },
    has: type => registry.has(type),
    evaluate: (metric, context) => {
      const evaluator = registry.get(metric.type)
      if (evaluator === undefined) throw new Error(`portable case metric is unsupported: ${metric.type}`)
      const passed = evaluator({ metric, ...context })
    const reason = passed
      ? undefined
      : metric.type.startsWith('output.')
        ? `输出未满足 ${metric.type} 断言`
        : `评测指标未通过: ${metric.type}`
    return check(metric.id, passed, reason, { type: metric.type })
    },
    types: () => [...registry.keys()].sort(),
  }
}

export function createMockTools(definitions = {}) {
  const calls = []
  return {
    calls,
    register(name, handler) { definitions[name] = handler; return this },
    async call(name, argumentsValue = {}) {
      const handler = definitions[name]
      if (typeof handler !== 'function') throw new Error(`mock tool is not registered: ${name}`)
      const result = await handler(argumentsValue)
      calls.push({ name, arguments: structuredClone(argumentsValue), result: structuredClone(result) })
      return result
    },
  }
}

export function createMockNetwork(routes = {}) {
  const requests = []
  return {
    requests,
    async request(url, options = {}) {
      const route = routes[url]
      if (route === undefined) throw new Error(`mock network route is not registered: ${url}`)
      const response = typeof route === 'function' ? await route({ url, options }) : route
      requests.push({ url, options: structuredClone(options), response: structuredClone(response) })
      return response
    },
  }
}

export function createTemporaryDatabase() {
  const records = new Map()
  return {
    async get(key) { return structuredClone(records.get(key)) },
    async set(key, value) { records.set(key, structuredClone(value)) },
    async delete(key) { records.delete(key) },
    async clear() { records.clear() },
  }
}

export function createReporterRegistry(custom = {}) {
  const reporters = new Map(Object.entries({
    json: report => JSON.stringify(report),
    markdown: report => `# Evaluation\n\n- Status: ${report.status}\n- Cases: ${report.summary?.totalCases ?? 0}\n- Passed: ${report.summary?.passedCases ?? 0}\n- Failed: ${report.summary?.failedCases ?? 0}\n`,
    junit: report => `<testsuite tests="${report.summary?.totalCases ?? 0}" failures="${report.summary?.failedCases ?? 0}"/>`,
    ...custom,
  }))
  return {
    register(name, reporter) { reporters.set(name, reporter); return this },
    async render(name, report) {
      const reporter = reporters.get(name)
      if (reporter === undefined) throw new Error(`reporter is unsupported: ${name}`)
      return String(await reporter(report))
    },
    types: () => [...reporters.keys()].sort(),
  }
}

export function defineFixture({ id, setup, teardown = async () => {} } = {}) {
  if (typeof id !== 'string' || typeof setup !== 'function') throw new TypeError('fixture requires id and setup')
  return Object.freeze({ id, setup, teardown })
}

export function defineCase({ id, title = id, fixtures = [], setup = [], steps, run, assertions = [], metrics } = {}) {
  if (typeof id !== 'string') throw new TypeError('case requires id')
  const normalizedSteps = steps ?? (run === undefined ? [] : [run])
  const normalizedMetrics = metrics ?? assertions.map((assertion, index) => ({ id: `assertion-${index + 1}`, type: assertion.op, expected: assertion.value }))
  return Object.freeze({ schemaVersion: 1, id, title, fixtures, setup, steps: normalizedSteps, metrics: normalizedMetrics })
}

export function defineSuite({ id, version = '1.0.0', fixtures = [], cases = [] } = {}) {
  if (typeof id !== 'string') throw new TypeError('suite requires id')
  return Object.freeze({ schemaVersion: 1, id, version, fixtures, cases })
}

async function runSetup(root, setup, environment, stepRegistry) {
  for (const action of setup) await stepRegistry.run(action, { root, environment, workspace: createWorkspace(root) })
}

function legacyPlan(plan) {
  if (Array.isArray(plan.steps) || Array.isArray(plan.metrics)) return validatePortableCasePlan(plan)
  return validatePortableCasePlan({ ...plan, steps: [plan.run], metrics: plan.assertions.map((assertion, index) => ({ id: `assertion-${index + 1}`, type: assertion.op, expected: assertion.value })) })
}

export async function runPortableCasePlan({ plan, runPlugin, baseEnvironment = {}, provenance = {}, fixtures = [], stepRegistry = createStepRegistry(), metricRegistry = createMetricRegistry(), tools = createMockTools(), network = createMockNetwork(), database = createTemporaryDatabase() } = {}) {
  if (!plan || typeof plan !== 'object') throw new Error('portable case plan is required')
  if (typeof runPlugin !== 'function') throw new Error('portable case plan runPlugin is required')
  const executable = legacyPlan(plan)
  if (!Array.isArray(executable.steps) || executable.steps.length === 0) throw new Error('portable case steps are required')
  if (!Array.isArray(executable.metrics) || executable.metrics.length === 0) throw new Error('portable case metrics are required')
  const root = await mkdtemp(resolve(tmpdir(), 'dsh-portable-case-'))
  const environment = { ...baseEnvironment }
  const workspace = createWorkspace(root)
  const runId = randomUUID()
  const startedAt = Date.now()
  const activeFixtures = fixtures.filter(fixture => executable.fixtures?.includes(fixture.id) || executable.fixtures === undefined)
  const environmentApi = { set: (name, value) => { environment[name] = value } }
  const context = { root, environment: environmentApi, workspace, runId }
  try {
    for (const fixture of activeFixtures) await fixture.setup(context)
    stepRegistry.register('environment.set', async (step, value) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(step.name) || typeof step.value !== 'string' || step.value.includes('\0')) throw new Error('portable case environment action is invalid')
      value.environment[step.name] = step.value
    })
    stepRegistry.register('workspace.write', (step, value) => value.workspace.write(step.path, step.content))
    stepRegistry.register('workspace.read', (step, value) => value.workspace.read(step.path))
    stepRegistry.register('plugin.prompt', async (step, value) => {
      const execution = await runPlugin({ input: step.input, cwd: root, env: environment, session: value.session })
      value.executions.push(execution)
    })
    const value = { root, environment, workspace, executions: [], session: { id: runId, messages: [] }, tools, network, database }
    await runSetup(root, executable.setup ?? [], environment, stepRegistry)
    for (const step of executable.steps) {
      if (step.op === 'plugin.prompt') value.session.messages.push({ role: 'user', content: step.input })
      await stepRegistry.run(step, value)
      if (step.op === 'plugin.prompt') value.session.messages.push({ role: 'assistant', content: value.executions.at(-1)?.output ?? '' })
    }
    const execution = value.executions.at(-1) ?? {}
    const output = typeof execution.output === 'string' ? execution.output : String(execution.output ?? '')
    const files = execution.files ?? await filesUnder(root)
    const evidence = { output, files, executions: value.executions, session: value.session, toolCalls: tools.calls, networkRequests: network.requests, database, execution }
    const checks = executable.metrics.map(metric => metricRegistry.evaluate(metric, { ...evidence, evidence }))
    const reasons = checks.filter(item => !item.passed).map(item => item.reason)
    const status = reasons.length === 0 ? 'passed' : 'failed'
    const finishedAt = Date.now()
    return {
      reportSchemaVersion: 1, reportId: runId, runId, status, reasons, checks,
      actualOutput: output, exitCode: execution.exitCode ?? 0, durationMs: finishedAt - startedAt,
      startedAt, finishedAt,
      summary: { status, totalCases: 1, passedCases: status === 'passed' ? 1 : 0, failedCases: status === 'failed' ? 1 : 0 },
      provenance: { schemeId: plan.id, schemeVersion: plan.schemaVersion, ...provenance },
      evidence: { files, toolCalls: tools.calls, networkRequests: network.requests, timedOut: execution.timedOut === true, messages: value.session.messages },
    }
  } finally {
    for (const fixture of [...activeFixtures].reverse()) await fixture.teardown(context)
    await rm(root, { recursive: true, force: true })
  }
}

export async function runSuite({ suite, runPlugin, reporters = {}, baseEnvironment = {}, stepRegistry, metricRegistry, tools, network, database } = {}) {
  if (!suite || !Array.isArray(suite.cases)) throw new Error('suite is required')
  const fixtures = suite.fixtures ?? []
  const cases = []
  for (const testCase of suite.cases) {
    cases.push(await runPortableCasePlan({ plan: testCase, runPlugin, fixtures, baseEnvironment, stepRegistry, metricRegistry, tools, network, database, provenance: { suiteId: suite.id, suiteVersion: suite.version, caseId: testCase.id } }))
  }
  const passed = cases.every(item => item.status === 'passed')
  const report = { reportSchemaVersion: 1, reportId: randomUUID(), suite: { id: suite.id, version: suite.version }, status: passed ? 'passed' : 'failed', cases, summary: { totalCases: cases.length, passedCases: cases.filter(item => item.status === 'passed').length, failedCases: cases.filter(item => item.status !== 'passed').length } }
  for (const reporter of Object.values(reporters)) await reporter(report)
  return report
}
