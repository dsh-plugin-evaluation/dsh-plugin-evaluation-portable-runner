import { PortableRunnerError } from './errors.js'

type StepHandler = (step: Record<string, any>, context: Record<string, any>) => unknown | Promise<unknown>

export function createStepRegistry(custom: Record<string, StepHandler> = {}) {
  const registry = new Map(Object.entries(custom))
  return {
    register(type: string, handler: StepHandler) {
      if (typeof type !== 'string' || typeof handler !== 'function') throw new TypeError('step registration is invalid')
      registry.set(type, handler)
      return this
    },
    has: (type: string) => registry.has(type),
    run: (step: Record<string, any>, context: Record<string, any>) => {
      const handler = registry.get(step.op)
      if (handler === undefined) throw new Error(`portable case step is unsupported: ${String(step.op)}`)
      return handler(step, context)
    },
    types: () => [...registry.keys()].sort(),
  }
}

export function registerBuiltinSteps(stepRegistry: ReturnType<typeof createStepRegistry>) {
  if (!stepRegistry.has('environment.set')) stepRegistry.register('environment.set', async (step, value) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(step.name) || typeof step.value !== 'string' || step.value.includes('\0')) throw new Error('portable case environment action is invalid')
    value.environment[step.name] = step.value
  })
  if (!stepRegistry.has('workspace.write')) stepRegistry.register('workspace.write', (step, value) => value.workspace.write(step.path, step.content))
  if (!stepRegistry.has('workspace.read')) stepRegistry.register('workspace.read', (step, value) => value.workspace.read(step.path))
  if (!stepRegistry.has('plugin.prompt')) stepRegistry.register('plugin.prompt', async (step, value) => {
    const request = value.runPlugin({ input: step.input, cwd: value.root, env: value.environment, session: value.session })
    const timeoutMs = value.limits?.timeoutMs
    const execution = typeof timeoutMs === 'number' && timeoutMs > 0
      ? await Promise.race([
        request,
        new Promise<Record<string, unknown>>(resolve => setTimeout(() => resolve({ output: '', exitCode: 124, timedOut: true }), timeoutMs)),
      ])
      : await request
    if (!execution || typeof execution !== 'object' || Array.isArray(execution)) throw new PortableRunnerError('plugin callback must return an execution object', 'invalid-plugin-result')
    value.executions.push(execution)
  })
}
