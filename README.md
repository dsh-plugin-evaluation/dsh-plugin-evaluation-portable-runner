# @dsh-plugin-evaluation/portable-runner

Host-independent execution engine for DSH Portable Case Plans.

## What and why

Portable Case Plans describe a small, deterministic evaluation contract without binding the evaluation to DSH process startup, profiles, credentials, or a web server. This package owns the reusable part of that contract:

- creates one temporary workspace per plan;
- applies the bounded setup operations;
- invokes a host-provided plugin callback;
- evaluates output assertions; and
- removes the temporary workspace after execution, including when setup or execution fails.

The package is intentionally independent of DSH. A DSH integration or another host remains responsible for starting a plugin and deciding how credentials and process isolation are provided.

## Install

```bash
npm install @dsh-plugin-evaluation/portable-runner@0.1.0
```

Node.js 20 or newer is required.

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

The package exports `runPortableCasePlan`:

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
    run: { op: 'plugin.prompt', input: 'answer' },
    assertions: [{ op: 'output.equals', value: 'safe' }],
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

The callback receives `{ input, cwd, env }`:

- `input` is the `plugin.prompt` input;
- `cwd` is the plan's private temporary workspace; and
- `env` is a copied environment containing `baseEnvironment` plus plan setup values.

The result contains `status`, structured `checks`, non-sensitive `reasons`, `actualOutput`, `exitCode`, and `durationMs`.

### Supported Portable Plan operations

Setup operations:

- `environment.set` with a valid environment variable name and string value;
- `workspace.write` with a relative path and string content; and
- `workspace.read` with a relative path.

Run operation:

- `plugin.prompt` with a non-empty input string.

Assertions:

- `output.equals`;
- `output.contains`; and
- `output.notContains`.

Plans must contain at least one assertion. Unsupported operations and malformed actions fail before the plugin callback is invoked.

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

This is an independent Git/npm repository. The companion DSH integration remains in [`dsh-agent-observe`](../dsh-agent-observe), which can provide the callback and DSH-specific lifecycle without being imported by this package.

The repository intentionally contains no GitHub remote, publish configuration, CLI, or web server. The public package boundary is the package root and the explicit `./package.json` metadata export.

## Testing and verification

Run the local test suite:

```bash
npm test
```

Run the local package verification script:

```bash
npm run verify
```

The verification script runs the test suite and `npm pack --dry-run --json`. A direct package smoke check should import the package root and exercise both a passing `output.contains` plan and a rejected traversal plan.

## License

MIT. See [`LICENSE`](./LICENSE).
