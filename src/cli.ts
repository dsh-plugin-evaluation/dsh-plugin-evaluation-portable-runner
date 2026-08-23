#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { createCommandRunner } from './command-adapter.js'
import { createReporterRegistry } from './reporters.js'
import { runPortableCasePlan } from './execution.js'

interface CliOptions {
  plan: string
  command: string
  args: string[]
  format: 'json' | 'markdown' | 'junit'
  output?: string
  timeoutMs?: number
  maxSteps?: number
  maxMetrics?: number
}

const HELP = `Usage: portable-runner --plan <file> --command <executable> [-- <args...>] [options]

Options:
  --plan <file>          Portable Plan JSON file, or - for stdin
  --command <executable> External command (shell is disabled)
  -- <args...>           Arguments passed to the external command
  --format <format>      json, markdown, or junit (default: json)
  --output <file>        Write the report to a file instead of stdout
  --timeout-ms <number>  Per-plugin execution timeout
  --max-steps <number>   Maximum number of plan steps
  --max-metrics <number> Maximum number of metrics
  --help                 Show this help
  --version              Show the package version
`

function numberOption(value: string, name: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number`)
  return parsed
}

function parseArgs(argv: readonly string[]): CliOptions | 'help' | 'version' {
  let plan: string | undefined
  let command: string | undefined
  let format: CliOptions['format'] = 'json'
  let output: string | undefined
  let timeoutMs: number | undefined
  let maxSteps: number | undefined
  let maxMetrics: number | undefined
  const args: string[] = []
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--help' || token === '-h') return 'help'
    if (token === '--version' || token === '-v') return 'version'
    if (token === '--') { args.push(...argv.slice(index + 1)); break }
    const value = argv[index + 1]
    if (token === '--plan' && value !== undefined) { plan = value; index += 1; continue }
    if (token === '--command' && value !== undefined) { command = value; index += 1; continue }
    if (token === '--format' && value !== undefined) {
      if (!['json', 'markdown', 'junit'].includes(value)) throw new Error('--format must be json, markdown, or junit')
      format = value as CliOptions['format']; index += 1; continue
    }
    if (token === '--output' && value !== undefined) { output = value; index += 1; continue }
    if (token === '--timeout-ms' && value !== undefined) { timeoutMs = numberOption(value, '--timeout-ms'); index += 1; continue }
    if (token === '--max-steps' && value !== undefined) { maxSteps = numberOption(value, '--max-steps'); index += 1; continue }
    if (token === '--max-metrics' && value !== undefined) { maxMetrics = numberOption(value, '--max-metrics'); index += 1; continue }
    throw new Error(`unknown or incomplete option: ${token}`)
  }
  if (plan === undefined || command === undefined) throw new Error('--plan and --command are required')
  return { plan, command, args, format, ...(output === undefined ? {} : { output }), ...(timeoutMs === undefined ? {} : { timeoutMs }), ...(maxSteps === undefined ? {} : { maxSteps }), ...(maxMetrics === undefined ? {} : { maxMetrics }) }
}

async function readPlan(path: string): Promise<unknown> {
  const text = path === '-' ? await new Promise<string>((resolve, reject) => { let value = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', (chunk: unknown) => { value += String(chunk) }); process.stdin.once('end', () => resolve(value)); process.stdin.once('error', reject) }) : await readFile(path, 'utf8')
  try { return JSON.parse(text) as unknown } catch { throw new Error('plan must contain valid JSON') }
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2))
  if (parsed === 'help') { process.stdout.write(HELP); return 0 }
  if (parsed === 'version') { process.stdout.write('0.1.12\n'); return 0 }
  const plan = await readPlan(parsed.plan)
  const runPluginAdapter = createCommandRunner({ command: parsed.command, args: parsed.args, ...(parsed.timeoutMs === undefined ? {} : { timeoutMs: parsed.timeoutMs }), baseEnvironment: process.env })
  const runPlugin = (request: Record<string, unknown>) => runPluginAdapter(request as { input: string; cwd: string; env: Record<string, string>; session: Record<string, unknown> }) as Promise<Record<string, unknown>>
  const limits = { ...(parsed.timeoutMs === undefined ? {} : { timeoutMs: parsed.timeoutMs }), ...(parsed.maxSteps === undefined ? {} : { maxSteps: parsed.maxSteps }), ...(parsed.maxMetrics === undefined ? {} : { maxMetrics: parsed.maxMetrics }) }
  const report = await runPortableCasePlan({ plan: plan as Record<string, unknown>, runPlugin, errorMode: 'report', limits })
  const rendered = await createReporterRegistry().render(parsed.format, report as unknown as Record<string, unknown>)
  if (parsed.output === undefined) process.stdout.write(`${rendered}\n`)
  else await writeFile(parsed.output, `${rendered}\n`, 'utf8')
  return report.status === 'passed' ? 0 : 1
}

try { process.exitCode = await main() } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2 }
