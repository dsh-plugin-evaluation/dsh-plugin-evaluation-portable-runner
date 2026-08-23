import type { PortableCheck, PortableMetric } from './contracts.js'

export type MetricContext = Record<string, unknown>
export type MetricEvaluation = { readonly score?: number; readonly passed?: boolean; readonly reason?: string; readonly confidence?: number; readonly details?: Record<string, unknown> }
export type Evaluator = (context: MetricContext) => boolean | number | MetricEvaluation | Promise<boolean | number | MetricEvaluation>
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}

function check(metric: PortableMetric, evaluation: boolean | number | MetricEvaluation): PortableCheck {
  // Keep compatibility with older custom evaluators that returned
  // `{ passed, details }` without the structured `score` field.
  const score = typeof evaluation === 'boolean'
    ? (evaluation ? 1 : 0)
    : typeof evaluation === 'number'
      ? evaluation
      : typeof evaluation.score === 'number'
        ? evaluation.score
        : typeof evaluation.passed === 'boolean'
          ? (evaluation.passed ? 1 : 0)
          : 0
  const boundedScore = Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0
  const custom: MetricEvaluation = typeof evaluation === 'object' && evaluation !== null ? evaluation : { score: boundedScore }
  const required = metric.required !== false
  const passed = typeof evaluation === 'boolean' ? evaluation : typeof custom.passed === 'boolean' ? custom.passed : boundedScore >= (metric.passScore ?? 0.8)
  const reason = custom.reason ?? (passed ? undefined : metric.type.startsWith('output.') ? `输出未满足 ${metric.type} 断言` : `评测指标未通过: ${metric.type}`)
  return { id: metric.id, passed, score: boundedScore, weight: typeof metric.weight === 'number' ? metric.weight : 1, required, ...(reason === undefined ? {} : { reason }), ...(typeof custom.confidence === 'number' ? { confidence: custom.confidence } : {}), details: { type: metric.type, ...(custom.details ?? {}) } }
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
    'llm_judge': async (context: MetricContext) => {
      const judge = context.judge
      if (typeof judge !== 'function') throw new Error('llm_judge requires a judge adapter')
      return judge({ metric: context.metric, expected: record(context.metric).expected, actual: context.output, evidence: context.evidence, signal: context.signal })
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
      const finish = (evaluation: boolean | number | MetricEvaluation) => check(metric, evaluation)
      const passed = evaluator({ metric, ...context })
      return typeof passed === 'object' && passed !== null && 'then' in passed
        ? (passed as Promise<boolean | number | MetricEvaluation>).then(finish)
        : finish(passed)
    },
    types: () => [...registry.keys()].sort(),
  }
}
