# Portable Runner v1 contract

Portable Runner executes a validated, host-independent evaluation case. The
host owns plugin startup and credentials; the runner owns the case lifecycle,
evidence collection, metric evaluation, report shape, and cleanup.

## Host callback

```js
await runPlugin({ input, cwd, env, session })
```

The callback returns an execution record. `output`, `exitCode`, `timedOut`,
`files`, and `toolCalls` are optional evidence fields; the runner normalizes
missing values without reading host files or environment variables itself.

## Case lifecycle

1. Validate the plan before creating a workspace.
2. Create one temporary workspace and an explicit environment copy.
3. Run selected fixture setup and plan setup actions.
4. Run steps in order; prompt steps share one session.
5. Evaluate every metric against the collected evidence.
6. Return one structured report.
7. Run fixture teardown in reverse order and remove the workspace.

Callers may provide execution limits (`timeoutMs`, `maxSteps`, and
`maxMetrics`). Invalid limits and plans exceeding count limits are rejected
before workspace creation. Timeout handling stops waiting for the callback;
the host remains responsible for terminating an underlying process.

The default error policy is `errorMode: 'throw'`. With `errorMode: 'report'`,
plugin or step failures become a failed report with an `execution-failed`
check, while fixture cleanup still runs.

Each case is isolated. A suite runs its cases independently and aggregates
their reports.

## v1 plan shape

Plans use `schemaVersion: 1`, a kebab-case `id`, at least one `steps` entry,
and at least one `metrics` entry. `steps` and `metrics` are the canonical
Runner contract; other input formats must be adapted by their caller.

## Security boundary

Workspace paths are relative and cannot contain traversal or backslash escape
forms. Environment values enter the run only through the explicit base
environment or `environment.set`. Hosts must provide only test credentials;
the runner never discovers host secrets.
