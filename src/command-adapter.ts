import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export interface CommandExecutionRequest {
  readonly input: string
  readonly cwd: string
  readonly env: Record<string, string>
  readonly session: Record<string, unknown>
}

export interface CommandExecutionResult {
  readonly output?: unknown
  readonly stdout?: string
  readonly stderr?: string
  readonly exitCode?: number
  readonly timedOut?: boolean
  readonly files?: readonly string[]
  readonly toolCalls?: readonly unknown[]
}

export interface CommandAdapterOptions {
  readonly command: string
  readonly args?: readonly string[]
  readonly timeoutMs?: number
  readonly baseEnvironment?: Readonly<Record<string, string | undefined>>
}

function readResult(value: string): CommandExecutionResult | undefined {
  if (value.trim() === '') return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    return parsed as CommandExecutionResult
  } catch {
    return undefined
  }
}

function runProcess(command: string, args: readonly string[], options: { cwd: string; env: Record<string, string>; timeoutMs?: number }): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
  return new Promise((resolve, reject) => {
    let child: any
    try {
      child = spawn(command, [...args], { cwd: options.cwd, env: options.env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      reject(error)
      return
    }
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let timer: ReturnType<typeof setTimeout> | undefined
    child.stdout?.on('data', (chunk: unknown) => { stdout += String(chunk) })
    child.stderr?.on('data', (chunk: unknown) => { stderr += String(chunk) })
    child.once('error', (error: unknown) => { if (timer) clearTimeout(timer); reject(error) })
    child.once('close', (code: number | null) => {
      if (timer) clearTimeout(timer)
      resolve({ stdout, stderr, exitCode: code ?? (timedOut ? 124 : 1), timedOut })
    })
    if (options.timeoutMs !== undefined) {
      timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
        setTimeout(() => { if (!child.killed) child.kill('SIGKILL') }, 250)
      }, options.timeoutMs)
    }
  })
}

export function createCommandRunner(options: CommandAdapterOptions) {
  if (typeof options.command !== 'string' || options.command.length === 0) throw new TypeError('command is required')
  const args = [...(options.args ?? [])]
  return async function runPlugin(request: CommandExecutionRequest): Promise<CommandExecutionResult> {
    const protocolRoot = join(request.cwd, '.portable-runner-command', randomUUID())
    const inputDir = join(protocolRoot, 'input')
    const outputDir = join(protocolRoot, 'output')
    await mkdir(inputDir, { recursive: true })
    await mkdir(outputDir, { recursive: true })
    await writeFile(join(inputDir, 'experiment.json'), JSON.stringify({ schemaVersion: 1, runId: randomUUID(), input: request.input, cwd: request.cwd, env: request.env, session: request.session }) + '\n', 'utf8')
    const processResult = await runProcess(options.command, args, {
      cwd: request.cwd,
      env: { ...Object.fromEntries(Object.entries(options.baseEnvironment ?? {}).filter((entry): entry is [string, string] => entry[1] !== undefined)), ...request.env, PORTABLE_RUNNER_INPUT_DIR: inputDir, PORTABLE_RUNNER_OUTPUT_DIR: outputDir, PORTABLE_RUNNER_WORKSPACE: request.cwd },
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    })
    let fileResult: CommandExecutionResult | undefined
    try { fileResult = readResult(await readFile(join(outputDir, 'experiment-result.json'), 'utf8')) } catch { fileResult = undefined }
    return {
      ...(fileResult ?? {}),
      output: fileResult?.output ?? processResult.stdout,
      stdout: fileResult?.stdout ?? processResult.stdout,
      stderr: fileResult?.stderr ?? processResult.stderr,
      exitCode: fileResult?.exitCode ?? processResult.exitCode,
      timedOut: fileResult?.timedOut ?? processResult.timedOut,
    }
  }
}
