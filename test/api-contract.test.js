import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createMetricRegistry,
  createMockNetwork,
  createMockTools,
  createReporterRegistry,
  createStepRegistry,
  createTemporaryDatabase,
  defineCase,
  defineFixture,
  defineSuite,
  validatePortableCasePlan,
  validatePortableSuite,
  runPortableCasePlan,
  runSuite,
} from '../dist/index.js'

const validPlan = (overrides = {}) => ({
  schemaVersion: 1,
  id: 'contract-case',
  steps: [{ op: 'plugin.prompt', input: 'hello' }],
  metrics: [{ id: 'answer', type: 'output.equals', expected: 'ok' }],
  ...overrides,
})

test('builders apply documented defaults and freeze their results', () => {
  const fixture = defineFixture({ id: 'fixture', setup() {} })
  const testCase = defineCase({ id: 'case' })
  const suite = defineSuite({ id: 'suite' })
  assert.equal(fixture.teardown.constructor.name, 'AsyncFunction')
  assert.deepEqual(testCase, { schemaVersion: 1, id: 'case', title: 'case', fixtures: [], setup: [], steps: [], metrics: [] })
  assert.deepEqual(suite, { schemaVersion: 1, id: 'suite', version: '1.0.0', fixtures: [], cases: [] })
  assert.equal(Object.isFrozen(fixture), true)
  assert.equal(Object.isFrozen(testCase), true)
  assert.equal(Object.isFrozen(suite), true)
})

test('builders reject missing and malformed required parameters', () => {
  assert.throws(() => defineFixture(), /fixture requires id and setup/)
  assert.throws(() => defineFixture({ id: 'x' }), /fixture requires id and setup/)
  assert.throws(() => defineCase(), /case requires id/)
  assert.throws(() => defineSuite(), /suite requires id/)
})

test('case and suite validators normalize optional fields and reject identity errors', () => {
  const plan = validatePortableCasePlan(validPlan())
  assert.deepEqual(plan.setup, [])
  assert.throws(() => validatePortableCasePlan(validPlan({ schemaVersion: 2 })), /schemaVersion must be 1/)
  assert.throws(() => validatePortableCasePlan(validPlan({ id: 'Not Kebab' })), /id must be kebab-case/)
  assert.throws(() => validatePortableCasePlan(validPlan({ steps: [] })), /steps must contain at least one item/)
  assert.throws(() => validatePortableCasePlan(validPlan({ metrics: [] })), /metrics must contain at least one item/)
  assert.throws(() => validatePortableSuite({ schemaVersion: 1, id: 'suite', version: '1', cases: [] }), /cases must contain at least one item/)
  assert.throws(() => validatePortableSuite({ schemaVersion: 1, id: 'suite', version: '1', cases: [plan, plan] }), /duplicated/)
})

test('step registry supports registration, lookup, ordering, async handlers, and errors', async () => {
  const registry = createStepRegistry()
  assert.equal(registry.has('custom.step'), false)
  assert.deepEqual(registry.register('custom.step', async step => step.value), registry)
  assert.equal(registry.has('custom.step'), true)
  assert.deepEqual(await registry.run({ op: 'custom.step', value: 42 }, {}), 42)
  assert.equal(registry.types().includes('custom.step'), true)
  assert.throws(() => registry.register('bad', null), /registration is invalid/)
  assert.throws(() => registry.run({ op: 'missing' }, {}), /unsupported/)
})

test('metric registry returns stable checks for pass, fail, custom, async, and unknown metrics', async () => {
  const registry = createMetricRegistry({ custom: async context => context.value === 1 })
  const passed = await registry.evaluate({ id: 'm', type: 'custom' }, { value: 1 })
  const failed = await registry.evaluate({ id: 'm', type: 'custom' }, { value: 2 })
  assert.deepEqual(passed, { id: 'm', passed: true, score: 1, weight: 1, required: true, details: { type: 'custom' } })
  assert.equal(failed.passed, false)
  assert.equal(registry.has('output.equals'), true)
  assert.equal(registry.types().includes('custom'), true)
  assert.throws(() => registry.evaluate({ id: 'x', type: 'unknown' }, {}), /unsupported/)
})

test('metric registry keeps compatibility with legacy structured evaluator results', async () => {
  const registry = createMetricRegistry({ legacy: () => ({ passed: true, details: { legacy: true } }) })
  assert.deepEqual(await registry.evaluate({ id: 'legacy', type: 'legacy' }, {}), {
    id: 'legacy', passed: true, score: 1, weight: 1, required: true,
    details: { type: 'legacy', legacy: true },
  })
})

test('reporter registry renders built-ins and custom reporters with argument validation', async () => {
  const registry = createReporterRegistry({ custom: report => `id:${report.id}` })
  assert.deepEqual(await registry.render('custom', { id: 'abc' }), 'id:abc')
  assert.match(await registry.render('json', { id: 'abc' }), /"id":"abc"/)
  assert.match(await registry.render('markdown', { status: 'passed', summary: {} }), /passed/)
  assert.match(await registry.render('junit', { summary: { totalCases: 1, failedCases: 0 } }), /tests="1"/)
  assert.equal(registry.types().includes('custom'), true)
  await assert.rejects(registry.render('unknown', {}), /unsupported/)
})

test('mock adapters record calls, serve routes, and isolate temporary database values', async () => {
  const tools = createMockTools({ add: args => Number(args.a) + Number(args.b) })
  assert.equal(await tools.call('add', { a: 2, b: 3 }), 5)
  assert.deepEqual(tools.calls[0].arguments, { a: 2, b: 3 })
  await assert.rejects(tools.call('missing'), /not registered/)
  const network = createMockNetwork({ '/health': { ok: true } })
  assert.deepEqual(await network.request('/health', { method: 'GET' }), { ok: true })
  assert.equal(network.requests[0].options.method, 'GET')
  await assert.rejects(network.request('/missing'), /not registered/)
  const database = createTemporaryDatabase()
  assert.equal(await database.get('missing'), undefined)
  await database.set('key', { value: 1 })
  assert.deepEqual(await database.get('key'), { value: 1 })
  await database.delete('key')
  assert.equal(await database.get('key'), undefined)
  await database.set('key', 1)
  await database.clear()
  assert.equal(await database.get('key'), undefined)
})

test('runPortableCasePlan applies defaults, provenance, and errorMode report', async () => {
  const result = await runPortableCasePlan({
    plan: validPlan({ metrics: [{ id: 'done', type: 'output.equals', expected: 'ok' }] }),
    provenance: { owner: 'test' },
    async runPlugin({ signal }) {
      assert.equal(signal.aborted, false)
      return { output: 'ok' }
    },
  })
  assert.equal(result.status, 'passed')
  assert.equal(result.provenance.owner, 'test')
  const reported = await runPortableCasePlan({
    plan: validPlan(),
    errorMode: 'report',
    async runPlugin() { throw new Error('boom') },
  })
  assert.equal(reported.status, 'failed')
  assert.equal(reported.checks[0].id, 'execution-failed')
})

test('runPortableCasePlan computes weighted scores and honors required metrics', async () => {
  const result = await runPortableCasePlan({
    plan: validPlan({
      scoring: { method: 'weighted-average', passScore: 0.8, weights: { correctness: 0.7, style: 0.3 }, required: ['correctness'] },
      metrics: [
        { id: 'correctness', type: 'quality', weight: 1, required: true },
        { id: 'style', type: 'quality', weight: 1, required: false },
      ],
    }),
    metricRegistry: createMetricRegistry({ quality: ({ metric }) => metric.id === 'correctness' ? 1 : 0.5 }),
    async runPlugin() { return { output: 'ok' } },
  })
  assert.equal(result.status, 'passed')
  assert.equal(result.score.value, 0.85)
  assert.equal(result.score.requiredPassed, true)
  assert.equal(result.checks[1].score, 0.5)

  const requiredFailure = await runPortableCasePlan({
    plan: validPlan({ scoring: { passScore: 0.1 }, metrics: [{ id: 'required', type: 'quality', required: true }] }),
    metricRegistry: createMetricRegistry({ quality: () => 0 }),
    async runPlugin() { return { output: 'ok' } },
  })
  assert.equal(requiredFailure.status, 'failed')
  assert.equal(requiredFailure.score.requiredPassed, false)
})

test('optional metric failures do not fail a plan without a scoring threshold', async () => {
  const result = await runPortableCasePlan({
    plan: validPlan({ metrics: [
      { id: 'required', type: 'quality', required: true },
      { id: 'informational', type: 'quality', required: false },
    ] }),
    metricRegistry: createMetricRegistry({ quality: ({ metric }) => metric.id === 'required' }),
    async runPlugin() { return { output: 'ok' } },
  })
  assert.equal(result.status, 'passed')
  assert.equal(result.score.requiredPassed, true)
  assert.equal(result.checks[1].passed, false)
})

test('runPortableCasePlan invokes a structured LLM judge adapter', async () => {
  let received
  const result = await runPortableCasePlan({
    plan: validPlan({ metrics: [{ id: 'semantic', type: 'llm_judge', expected: 'safe', rubric: 'must be safe', passScore: 0.8 }] }),
    judge: async input => { received = input; return { score: 0.9, confidence: 0.87, reason: '符合要求', details: { model: 'judge-1' } } },
    async runPlugin() { return { output: 'safe' } },
  })
  assert.equal(result.status, 'passed')
  assert.equal(result.checks[0].score, 0.9)
  assert.equal(result.checks[0].confidence, 0.87)
  assert.equal(received.metric.id, 'semantic')
  assert.equal(received.expected, 'safe')
  assert.equal(received.actual, 'safe')
})

test('runPortableCasePlan reports metric evaluation failures with score metadata', async () => {
  const result = await runPortableCasePlan({
    plan: validPlan({ metrics: [{ id: 'judge', type: 'llm_judge', expected: 'safe' }] }),
    errorMode: 'report',
    async runPlugin() { return { output: 'safe' } },
  })
  assert.equal(result.status, 'failed')
  assert.deepEqual(result.checks[0], {
    id: 'judge', passed: false, score: 0, weight: 1, required: true,
    reason: '评测指标执行失败: llm_judge requires a judge adapter',
    details: { type: 'llm_judge', code: 'metric-evaluation-failed' },
  })
})

test('runPortableCasePlan rejects invalid scoring fields', async () => {
  await assert.rejects(() => runPortableCasePlan({
    plan: validPlan({ metrics: [{ id: 'm', type: 'quality', weight: -1 }] }),
    async runPlugin() { return { output: 'ok' } },
  }), /weight must be non-negative/)
  await assert.rejects(() => runPortableCasePlan({
    plan: validPlan({ metrics: [{ id: 'm', type: 'quality', passScore: 2 }] }),
    async runPlugin() { return { output: 'ok' } },
  }), /passScore must be between 0 and 1/)
})

test('runSuite validates cases, aggregates status, and invokes reporters', async () => {
  const seen = []
  const suite = defineSuite({ id: 'contract-suite', version: '2.0.0', cases: [
    defineCase({ id: 'one', steps: [{ op: 'plugin.prompt', input: 'one' }], metrics: [{ id: 'm', type: 'output.equals', expected: 'ok' }] }),
  ] })
  const report = await runSuite({ suite, async runPlugin() { return { output: 'ok' } }, reporters: { capture(value) { seen.push(value) } } })
  assert.equal(report.status, 'passed')
  assert.equal(report.summary.totalCases, 1)
  assert.equal(report.cases[0].provenance.suiteId, 'contract-suite')
  assert.equal(seen[0], report)
})
