# @dsh-plugin-evaluation/portable-runner

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

Host-independent execution engine for DSH Portable Case Plans.

## What and why

Portable Case Plans describe a small, deterministic evaluation contract without binding the evaluation to DSH process startup, profiles, credentials, or a web server. This package owns the reusable part of that contract:

- creates one temporary workspace per plan;
- applies the bounded setup operations;
- invokes a host-provided plugin callback;
- evaluates registered metrics; and
- removes the temporary workspace after execution, including when setup or execution fails.

The package is intentionally independent of DSH. A DSH integration or another host remains responsible for starting a plugin and deciding how credentials and process isolation are provided.

### Terminology

- **Portable Case Plan**: one evaluation scenario containing preparation, plugin steps, and checks.
- **Suite**: a group of evaluation plans with shared fixtures and an aggregate report.
- **Fixture**: test data or environment setup applied before a plan.
- **Step**: one operation in a plan, such as a prompt or workspace action.
- **Metric**: a check that decides whether the result meets expectations.
- **Evidence**: collected execution records such as output, files, messages, and calls.
- **Provenance**: metadata describing which plan and caller produced a report.
- **Registry**: an extension point for custom steps, metrics, or report renderers.
- **`runPlugin` callback**: the host-owned function that actually invokes the plugin.

## Install

```bash
npm install @dsh-plugin-evaluation/portable-runner@0.1.11
```

Node.js 20 or newer is required.

## CLI

The package also exposes `portable-runner`, a cross-language command-line
entrypoint. It invokes an external command using the same one-shot file
protocol used by the DSH experiment runner:

```bash
npm run build
node dist/cli.js \
  --plan ./examples/order-status.plan.json \
  --format json \
  --timeout-ms 30000 \
  --command node -- ./plugin-adapter.mjs
```

The command receives `PORTABLE_RUNNER_INPUT_DIR` and
`PORTABLE_RUNNER_OUTPUT_DIR`. It reads `input/experiment.json` and may write
`output/experiment-result.json` with `output`, `stdout`, `stderr`, `exitCode`,
`timedOut`, `files`, and `toolCalls`. If no result file is written, stdout is
used as the output fallback. The CLI never invokes a shell.

Exit code `0` means the evaluation passed, `1` means checks failed, `2` means
CLI or protocol failure, and `124` means the external command timed out.

To remove the package from a project, run `npm uninstall
@dsh-plugin-evaluation/portable-runner`. For a global CLI installation, use
`npm uninstall -g @dsh-plugin-evaluation/portable-runner`. If you used
`npm link` during development, remove the link with
`npm unlink -g @dsh-plugin-evaluation/portable-runner`.

## Release

普通 push 只运行 CI，不会发布 npm。发布新版本时，先更新
`package.json` 的版本号，再创建并推送同名 tag：

```bash
npm version patch
git push origin main --follow-tags
```

推送 `vX.Y.Z` tag 后，GitHub Actions 会先运行 `npm run verify`，确认 tag
与 `package.json` 版本一致后，再通过 npm Trusted Publishing 发布包。首次使用前，需要在 npm 包设置中将对应 GitHub 仓库和 `Publish` workflow 配置为 Trusted Publisher。

## API

The package exports `runPortableCasePlan` and small builders for reusable suites:

```js
import { runPortableCasePlan } from '@dsh-plugin-evaluation/portable-runner'

const result = await runPortableCasePlan({
  plan: {
    schemaVersion: 1,
    id: 'portable-smoke',
    title: 'Portable runner smoke test',
    setup: [
      { op: 'environment.set', name: 'EXPECTED', value: 'safe' },
      { op: 'workspace.write', path: 'input.txt', content: 'fixture' },
      { op: 'workspace.read', path: 'input.txt' },
    ],
    steps: [{ op: 'plugin.prompt', input: 'answer' }],
    metrics: [{ id: 'expected-output', type: 'output.equals', expected: 'safe' }],
  },
  baseEnvironment: { PATH: process.env.PATH ?? '' },
  async runPlugin({ input, cwd, env }) {
    void input
    void cwd
    return { output: env.EXPECTED, exitCode: 0 }
  },
})

console.log(result.status)
```

`steps` and `metrics` are the only supported plan fields. A plan must contain
at least one step and one metric. Other input formats must be adapted by the
caller before invoking the runner.

The callback receives `{ input, cwd, env, session, signal }`:

- `input` is the `plugin.prompt` input;
- `cwd` is the plan's private temporary workspace; and
- `env` is a copied environment containing `baseEnvironment` plus plan setup values.
- `session` contains the current multi-step conversation history; and
- `signal` is aborted when the configured timeout expires, allowing hosts to
  cancel underlying work promptly.

The result contains `status`, structured `checks`, non-sensitive `reasons`, `actualOutput`, `exitCode`, and `durationMs`.

Execution can be bounded with optional limits:

```js
limits: { timeoutMs: 30_000, maxSteps: 100, maxMetrics: 100 }
```

`timeoutMs` converts a slow plugin call into a timed-out execution. The host
must still terminate the underlying process when true cancellation is needed.
By default plugin and step errors are thrown. Set `errorMode: 'report'` to
return a failed report containing an `execution-failed` check instead.

`runPortableCasePlan` options at a glance:

- `plan` (`PortableCasePlan`, required): one evaluation scenario;
- `runPlugin` (callback, required): the host function that invokes the plugin;
- `baseEnvironment` (default `{}`): initial environment values;
- `provenance` (default `{}`): caller metadata stored in the report;
- `secrets` (default `[]`): values to detect and redact;
- `fixtures` (default `[]`): setup and teardown hooks selected by the plan;
- `stepRegistry` and `metricRegistry`: built-in or custom operations and checks;
- `limits.timeoutMs`: maximum wait for one plugin call;
- `limits.maxSteps`: maximum plan steps, checked before workspace creation;
- `limits.maxMetrics`: maximum checks, checked before execution;
- `errorMode` (default `'throw'`): use `'report'` to return an
  `execution-failed` check instead of throwing plugin or step errors.

### Suite, fixture, and multi-step execution

`defineSuite`, `defineCase`, and `defineFixture` compose reusable evaluations. A
case can contain multiple `steps`; repeated `plugin.prompt` steps receive the
same session object, so hosts can implement multi-turn conversations. Plan
validation rejects invalid schema versions, IDs, empty steps/metrics, malformed
prompt steps, and duplicate metric IDs before a workspace is created.

```js
const suite = defineSuite({
  id: 'quality',
  fixtures: [defineFixture({
    id: 'seed',
    setup: ({ environment }) => environment.set('EXPECTED', 'safe'),
  })],
  cases: [defineCase({
    id: 'answer',
    fixtures: ['seed'],
    steps: [
      { op: 'plugin.prompt', input: 'first question' },
      { op: 'plugin.prompt', input: 'follow-up question' },
    ],
    metrics: [{ id: 'answer', type: 'output.contains', expected: 'safe' }],
  })],
})

const report = await runSuite({ suite, runPlugin, reporters: {
  json: value => console.log(JSON.stringify(value)),
} })
```

Each case returns the same runner-native report shape as
`runPortableCasePlan`. A suite wraps those case reports and adds suite-level
summary fields.

`runSuite` requires `suite` and `runPlugin`. Optional `reporters` (default
`{}`) receive the completed suite report by name. Optional environment,
secret, registry, tool, network, and database settings are passed to each
case when supplied.

### Registered steps and metrics

`createStepRegistry()` adds execution operations without changing the runner
loop. `createMetricRegistry()` adds checks against the collected evidence.
Built-in metrics include output equality/containment, timeout, file existence,
credential-like secret detection, and expected tool calls. Hosts can return
`timedOut`, `files`, and `toolCalls` from `runPlugin` for those checks.

The runner also exports isolated test adapters: `createMockTools()` records tool
calls, `createMockNetwork()` serves declared routes and records requests, and
`createTemporaryDatabase()` provides an in-memory store scoped to one run.
Evidence includes session messages, tool calls, network requests, workspace
files, timeout state, and the final execution.

`createReporterRegistry()` provides JSON, Markdown, and JUnit renderers behind
one interface. Custom reporters can be registered without changing execution.
The JUnit renderer escapes XML special characters in generated attributes.

Registries expose a small common vocabulary: `register(name, handler)` adds an
extension, `has(name)` checks availability, and `types()` lists registered
names. Reporter registries additionally expose `render(name, report)`.

## Report shape

`runPortableCasePlan` returns a single-case report with these stable fields:

```json
{
  "reportSchemaVersion": 1,
  "reportId": "uuid",
  "runId": "uuid",
  "status": "passed",
  "reasons": [],
  "checks": [
    {
      "id": "expected-output",
      "status": "passed",
      "passed": true,
      "type": "output.equals"
    }
  ],
  "actualOutput": "safe",
  "exitCode": 0,
  "durationMs": 4,
  "startedAt": 1710000000000,
  "finishedAt": 1710000000004,
  "summary": {
    "status": "passed",
    "totalCases": 1,
    "passedCases": 1,
    "failedCases": 0
  },
  "provenance": {
    "schemeId": "portable-smoke",
    "schemeVersion": 1
  },
  "evidence": {
    "files": [],
    "toolCalls": [],
    "networkRequests": [],
    "timedOut": false,
    "messages": []
  }
}
```

`status` is `passed` when every metric passes and `failed` otherwise. Failed
checks are listed in `checks`, with safe human-readable explanations in
`reasons`. Evidence is intended for diagnostics and reporting; hosts should
still redact credentials before exposing reports outside a trusted boundary.

For a suite, the top-level report contains `suite`, `cases`, and a summary with
`totalCases`, `passedCases`, and `failedCases`. Each entry in `cases` is a
single-case report with the shape above.

## Extension API

The runner is extensible without changing its execution loop:

```js
const stepRegistry = createStepRegistry().register(
  'custom.prepare',
  async (step, context) => {
    context.environment.PREPARED = String(step.value)
  },
)

const metricRegistry = createMetricRegistry().register(
  'output.startsWith',
  ({ metric, output }) => output.startsWith(metric.expected),
)

const reporters = createReporterRegistry().register(
  'text',
  report => `${report.status}: ${report.summary?.passedCases ?? 0} passed`,
)
```

Pass `stepRegistry` and `metricRegistry` to `runPortableCasePlan` or `runSuite`.
Use a reporter registry separately to render a completed report, or pass
reporter functions in the `reporters` object accepted by `runSuite`. A custom
step receives the step object and the runner execution context. A custom metric
receives `{ metric, output, files, execution, evidence }` and returns a
boolean. A custom reporter receives the completed report and may return a
string or a promise for a string.

### Supported Portable Plan operations

Setup operations:

- `environment.set` with a valid environment variable name and string value;
- `workspace.write` with a relative path and string content; and
- `workspace.read` with a relative path.

Run operation:

- `plugin.prompt` with a non-empty input string.

Metrics:

- `output.equals`;
- `output.contains`;
- `output.notContains`;
- `no-timeout`;
- `file-exists`;
- `no-secret`; and
- `tool-calls`.

Only the multi-step/multi-metric plan shape is supported. Callers using another
format must adapt it before invoking the runner.

Plans must contain at least one metric. Unsupported operations and malformed
actions fail before the plugin callback is invoked.

## Security boundaries

This package is a bounded plan runner, not a general-purpose command executor.

- It never starts a process and never launches a web server.
- It has no DSH imports or DSH runtime dependencies.
- Each invocation gets a fresh temporary workspace that is removed in a `finally` block.
- Workspace paths must be relative, reject NUL bytes, and reject path components named `..`; resolved paths must remain inside the temporary workspace.
- Environment setup accepts only shell-compatible variable names and string values without NUL bytes.
- The host callback is the trust boundary for plugin execution. Hosts must apply their own process, credential, network, and filesystem restrictions.
- Assertion failure reasons do not include assertion values, preventing a secret supplied to `output.notContains` from being copied into the result reason.

The runner does not promise that a plugin callback is safe. Do not pass untrusted callbacks without an appropriate host sandbox.

## Development

This is an independent Git/npm repository. The companion DSH integration remains in [`dsh-agent-observe`](https://github.com/dsh-plugin-evaluation/dsh-agent-observe), which can provide the callback and DSH-specific lifecycle without being imported by this package.

The package includes a CLI as well as the library API. The public package
boundary is the package root and the explicit `./package.json` metadata export.

Generate the complete API reference directly from the TypeScript source:

```bash
npm run docs:generate
npm run docs:check
```

The hand-written [`docs/index.html`](./docs/index.html) is the quick-start
guide; the generated reference is in [`docs/api`](./docs/api/index.html).

## Testing and verification

Run the local test suite:

```bash
npm test
```

Run the local package verification script:

```bash
npm run verify
```

The verification script checks the 300-line limit, builds TypeScript, runs the
tests, validates generated TypeDoc, and performs `npm pack --dry-run --json`.
The dry-run package should contain only the public source, type declarations,
README, license, and package metadata. A direct package smoke check should
import the package root and exercise both a passing `output.contains` plan and
a rejected traversal plan.

## License

MIT. See [`LICENSE`](./LICENSE).
