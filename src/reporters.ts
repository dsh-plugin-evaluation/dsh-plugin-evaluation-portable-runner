export type Reporter = (report: Record<string, unknown>) => unknown | Promise<unknown>
const field = (report: Record<string, unknown>, key: string): unknown => report[key]
const escapeXml = (value: unknown): string => String(value).replace(/&/gu, '&amp;').replace(/"/gu, '&quot;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/'/gu, '&apos;')

export function createReporterRegistry(custom: Record<string, Reporter> = {}) {
  const reporters = new Map<string, Reporter>(Object.entries({
    json: (report: Record<string, unknown>) => JSON.stringify(report),
    markdown: (report: Record<string, unknown>) => {
      const summary = (field(report, 'summary') as Record<string, unknown> | undefined) ?? {}
      return `# Evaluation\n\n- Status: ${String(field(report, 'status') ?? 'unknown')}\n- Cases: ${summary.totalCases ?? 0}\n- Passed: ${summary.passedCases ?? 0}\n- Failed: ${summary.failedCases ?? 0}\n`
    },
    junit: (report: Record<string, unknown>) => {
      const summary = (field(report, 'summary') as Record<string, unknown> | undefined) ?? {}
      return `<testsuite tests="${escapeXml(summary.totalCases ?? 0)}" failures="${escapeXml(summary.failedCases ?? 0)}"/>`
    },
    ...custom,
  }))
  return {
    register(name: string, reporter: Reporter) { reporters.set(name, reporter); return this },
    async render(name: string, report: Record<string, unknown>) {
      const reporter = reporters.get(name)
      if (reporter === undefined) throw new Error(`reporter is unsupported: ${name}`)
      return String(await reporter(report))
    },
    types: () => [...reporters.keys()].sort(),
  }
}
