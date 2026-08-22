import type { PortableCasePlan, PortableMetric, PortableStep } from './contracts.js'

type RecordValue = Record<string, unknown>
const isRecord = (value: unknown): value is RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value)
const isKebab = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)
const isOp = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(value)
const requireString: (value: unknown, message: string) => asserts value is string = (value, message) => {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) throw new TypeError(message)
}
const requireText: (value: unknown, message: string) => asserts value is string = (value, message) => {
  if (typeof value !== 'string' || value.includes('\0')) throw new TypeError(message)
}

function validateStep(value: unknown): PortableStep {
  if (!isRecord(value) || !isOp(value.op)) throw new TypeError('portable case action must have a valid op')
  if (value.op === 'plugin.prompt') requireString(value.input, 'portable case prompt input must be non-empty')
  if (value.op === 'environment.set') {
    if (typeof value.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value.name)) throw new TypeError('portable case environment name is invalid')
    requireText(value.value, 'portable case environment value is invalid')
  }
  if (value.op === 'workspace.write') {
    requireString(value.path, 'portable case workspace path is required')
    requireText(value.content, 'portable case workspace content is invalid')
  }
  if (value.op === 'workspace.read') requireString(value.path, 'portable case workspace path is required')
  return value as PortableStep
}

function validateMetric(value: unknown, ids: Set<string>): PortableMetric {
  if (!isRecord(value) || !isKebab(value.id) || typeof value.type !== 'string' || value.type.length === 0) throw new TypeError('portable case metric must have id and type')
  if (ids.has(value.id)) throw new TypeError(`portable case metric ${value.id} is duplicated`)
  ids.add(value.id)
  if (['output.equals', 'output.contains', 'output.notContains', 'output-exact'].includes(value.type) && !('expected' in value)) throw new TypeError(`portable case metric ${value.id} expected value is required`)
  if (value.type === 'file-exists') requireString(value.path, `portable case metric ${value.id} path is required`)
  if (value.type === 'tool-calls' && (!Array.isArray(value.expected) || value.expected.some(item => typeof item !== 'string' || item.length === 0))) throw new TypeError(`portable case metric ${value.id} expected tool names are invalid`)
  return value as PortableMetric
}

export function validatePortableCasePlan(input: unknown): PortableCasePlan {
  if (!isRecord(input)) throw new TypeError('portable case plan must be an object')
  if (input.schemaVersion !== 1) throw new TypeError('portable case schemaVersion must be 1')
  if (!isKebab(input.id)) throw new TypeError('portable case id must be kebab-case')
  if (input.setup !== undefined && (!Array.isArray(input.setup) || input.setup.some(item => !isRecord(item)))) throw new TypeError('portable case setup must be an array')
  if (!Array.isArray(input.steps) || input.steps.length === 0) throw new TypeError('portable case steps must contain at least one item')
  if (!Array.isArray(input.metrics) || input.metrics.length === 0) throw new TypeError('portable case metrics must contain at least one item')
  if (input.fixtures !== undefined && (!Array.isArray(input.fixtures) || input.fixtures.some(id => typeof id !== 'string' || id.length === 0))) throw new TypeError('portable case fixtures must be an array of ids')
  const ids = new Set<string>()
  const metrics = input.metrics.map(metric => validateMetric(metric, ids))
  const steps = input.steps.map(validateStep)
  const setup = (input.setup ?? []).map(validateStep)
  return { schemaVersion: 1, id: input.id, ...(typeof input.title === 'string' ? { title: input.title } : {}), ...(input.fixtures ? { fixtures: input.fixtures as string[] } : {}), setup, steps, metrics }
}

export function validatePortableSuite(input: unknown) {
  if (!isRecord(input)) throw new TypeError('portable suite must be an object')
  if (input.schemaVersion !== 1) throw new TypeError('portable suite schemaVersion must be 1')
  if (!isKebab(input.id)) throw new TypeError('portable suite id must be kebab-case')
  if (typeof input.version !== 'string' || input.version.length === 0) throw new TypeError('portable suite version is required')
  if (!Array.isArray(input.cases) || input.cases.length === 0) throw new TypeError('portable suite cases must contain at least one item')
  const ids = new Set<string>()
  const cases = input.cases.map(testCase => {
    const checked = validatePortableCasePlan(testCase)
    if (ids.has(checked.id)) throw new TypeError(`portable suite case ${checked.id} is duplicated`)
    ids.add(checked.id)
    return checked
  })
  if (input.fixtures !== undefined && (!Array.isArray(input.fixtures) || input.fixtures.some(fixture => !isRecord(fixture) || typeof fixture.id !== 'string'))) throw new TypeError('portable suite fixtures are invalid')
  return { schemaVersion: 1 as const, id: input.id, version: input.version, fixtures: input.fixtures ?? [], cases }
}
