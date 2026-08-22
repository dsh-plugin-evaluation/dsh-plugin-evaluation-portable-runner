import assert from 'node:assert/strict'
import { runPortableCasePlan } from '../dist/index.js'

const passing = await runPortableCasePlan({
  plan: {
    schemaVersion: 1,
    id: 'smoke-pass',
    title: 'Portable runner smoke',
    setup: [{ op: 'environment.set', name: 'SMOKE_VALUE', value: 'safe' }],
    steps: [{ op: 'plugin.prompt', input: 'smoke' }],
    metrics: [{ id: 'expected-output', type: 'output.contains', expected: 'safe' }],
  },
  async runPlugin({ env }) {
    return { output: env.SMOKE_VALUE, exitCode: 0 }
  },
})
assert.equal(passing.status, 'passed')

await assert.rejects(
  runPortableCasePlan({
    plan: {
      schemaVersion: 1,
      id: 'smoke-traversal',
      title: 'Portable runner traversal',
      setup: [{ op: 'workspace.write', path: '../escape', content: 'blocked' }],
      steps: [{ op: 'plugin.prompt', input: 'smoke' }],
      metrics: [{ id: 'expected-output', type: 'output.contains', expected: 'safe' }],
    },
    async runPlugin() {
      throw new Error('traversal must be rejected before callback')
    },
  }),
  /must be relative/,
)

console.log('portable-runner smoke passed: contains assertion and traversal rejection')
