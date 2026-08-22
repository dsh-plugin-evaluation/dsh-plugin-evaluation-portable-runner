import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

const exec = promisify(execFile)
const cli = join(process.cwd(), 'dist', 'cli.js')

test('CLI executes an external command using the file protocol', async () => {
  const root = await mkdtemp(join(tmpdir(), 'portable-runner-cli-test-'))
  const planPath = join(root, 'plan.json')
  const adapter = "const fs=require('node:fs');const path=require('node:path');const i=JSON.parse(fs.readFileSync(path.join(process.env.PORTABLE_RUNNER_INPUT_DIR,'experiment.json'),'utf8'));fs.writeFileSync(path.join(process.env.PORTABLE_RUNNER_OUTPUT_DIR,'experiment-result.json'),JSON.stringify({output:'received:'+i.input,exitCode:0}));"
  await writeFile(planPath, JSON.stringify({ schemaVersion: 1, id: 'cli-case', steps: [{ op: 'plugin.prompt', input: 'hello' }], metrics: [{ id: 'output', type: 'output.equals', expected: 'received:hello' }] }))
  try {
    const result = await exec(process.execPath, [cli, '--plan', planPath, '--command', process.execPath, '--', '-e', adapter], { encoding: 'utf8' })
    const report = JSON.parse(result.stdout)
    assert.equal(report.status, 'passed')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('CLI returns exit code 1 for failed evaluation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'portable-runner-cli-fail-'))
  const planPath = join(root, 'plan.json')
  const adapter = "const fs=require('node:fs');const path=require('node:path');fs.writeFileSync(path.join(process.env.PORTABLE_RUNNER_OUTPUT_DIR,'experiment-result.json'),JSON.stringify({output:'wrong',exitCode:0}));"
  await writeFile(planPath, JSON.stringify({ schemaVersion: 1, id: 'cli-fail', steps: [{ op: 'plugin.prompt', input: 'hello' }], metrics: [{ id: 'output', type: 'output.equals', expected: 'right' }] }))
  try {
    await assert.rejects(exec(process.execPath, [cli, '--plan', planPath, '--command', process.execPath, '--', '-e', adapter], { encoding: 'utf8' }), error => error.code === 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('CLI displays help without requiring a plan', async () => {
  const result = await exec(process.execPath, [cli, '--help'], { encoding: 'utf8' })
  assert.match(result.stdout, /Usage: portable-runner/)
})

test('CLI terminates a command that ignores SIGTERM after timeout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'portable-runner-cli-timeout-'))
  const planPath = join(root, 'plan.json')
  const adapter = "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"
  await writeFile(planPath, JSON.stringify({ schemaVersion: 1, id: 'cli-timeout', steps: [{ op: 'plugin.prompt', input: 'hello' }], metrics: [{ id: 'deadline', type: 'no-timeout' }] }))
  try {
    await assert.rejects(exec(process.execPath, [cli, '--plan', planPath, '--command', process.execPath, '--timeout-ms', '50', '--', '-e', adapter], { encoding: 'utf8', timeout: 2000 }), error => error.code === 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
