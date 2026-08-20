import assert from 'node:assert/strict'
import { runPortableCasePlan } from '@dsh-plugin-evaluation/portable-runner'

const passing = await runPortableCasePlan({
  plan: {
    setup: [{ op: 'environment.set', name: 'SMOKE_VALUE', value: 'safe' }],
    run: { op: 'plugin.prompt', input: 'smoke' },
    assertions: [{ op: 'output.contains', value: 'safe' }],
  },
  async runPlugin({ env }) {
    return { output: env.SMOKE_VALUE, exitCode: 0 }
  },
})
assert.equal(passing.status, 'passed')

await assert.rejects(
  runPortableCasePlan({
    plan: {
      setup: [{ op: 'workspace.write', path: '../escape', content: 'blocked' }],
      run: { op: 'plugin.prompt', input: 'smoke' },
      assertions: [{ op: 'output.contains', value: 'safe' }],
    },
    async runPlugin() {
      throw new Error('traversal must be rejected before callback')
    },
  }),
  /must be relative/,
)

console.log('portable-runner smoke passed: contains assertion and traversal rejection')
