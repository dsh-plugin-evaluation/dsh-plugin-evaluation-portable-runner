import type { PortableCheck, PortableMetric } from './contracts.js'

export type MetricContext = Record<string, unknown>
export type Evaluator = (context: MetricContext) => boolean | Promise<boolean>
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}

function check(id: string, passed: boolean, reason: string | undefined, details: Record<string, unknown> = {}): PortableCheck {
  return { id, passed, ...(reason === undefined ? {} : { reason }), details }
}

export function createMetricRegistry(custom: Record<string, Evaluator> = {}) {
  const registry = new Map<string, Evaluator>(Object.entries({
    'output.equals': (context: MetricContext) => context.output === record(context.metric).expected,
    'output.contains': (context: MetricContext) => String(context.output ?? '').includes(String(record(context.metric).expected ?? '')),
    'output.notContains': (context: MetricContext) => !String(context.output ?? '').includes(String(record(context.metric).expected ?? '')),
    'output-exact': (context: MetricContext) => String(context.output ?? '').trim() === String(record(context.metric).expected ?? ''),
    'file-exists': (context: MetricContext) => (Array.isArray(context.files) ? context.files : []).includes(record(context.metric).path),
    'no-timeout': (context: MetricContext) => record(context.execution).timedOut !== true,
    'no-secret': (context: MetricContext) => {
      const execution = record(context.execution)
      const text = `${context.output ?? ''}\n${execution.stdout ?? ''}\n${execution.stderr ?? ''}`
      const secrets = Array.isArray(context.secrets) ? context.secrets : []
      if (secrets.some(secret => typeof secret === 'string' && secret.length > 0 && text.includes(secret))) return false
      return !text.match(/(api[_ -]?key|secret|password|authorization|bearer)\s*[:=]/iu)
    },
    'tool-calls': (context: MetricContext) => {
      const expected = record(context.metric).expected
      const calls = record(context.execution).toolCalls
      return (Array.isArray(expected) ? expected : []).every(name => (Array.isArray(calls) ? calls : []).some(call => (typeof call === 'string' ? call : record(call).name) === name))
    },
    ...custom,
  }) as Array<[string, Evaluator]>)
  return {
    register(type: string, evaluator: Evaluator) {
      if (typeof type !== 'string' || typeof evaluator !== 'function') throw new TypeError('metric registration is invalid')
      registry.set(type, evaluator)
      return this
    },
    has: (type: string) => registry.has(type),
    evaluate: (metric: PortableMetric, context: MetricContext) => {
      const evaluator = registry.get(metric.type)
      if (evaluator === undefined) throw new Error(`portable case metric is unsupported: ${String(metric.type)}`)
      const finish = (passed: boolean) => {
        const reason = passed ? undefined : metric.type.startsWith('output.') ? `输出未满足 ${metric.type} 断言` : `评测指标未通过: ${metric.type}`
        return check(metric.id, passed, reason, { type: metric.type })
      }
      const passed = evaluator({ metric, ...context })
      return typeof passed === 'object' && passed !== null && 'then' in passed
        ? (passed as Promise<boolean>).then(finish)
        : finish(passed)
    },
    types: () => [...registry.keys()].sort(),
  }
}
