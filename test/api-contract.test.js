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
  assert.deepEqual(passed, { id: 'm', passed: true, details: { type: 'custom' } })
  assert.equal(failed.passed, false)
  assert.equal(registry.has('output.equals'), true)
  assert.equal(registry.types().includes('custom'), true)
  assert.throws(() => registry.evaluate({ id: 'x', type: 'unknown' }, {}), /unsupported/)
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
