# @dsh-plugin-evaluation/portable-runner

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

与宿主环境无关的 DSH Portable Case Plan（可移植评测方案）执行器。

## 用途

Runner 负责创建临时工作区、执行准备步骤、调用宿主提供的插件函数、运行评测指标，并在结束后清理工作区。它不会启动 DSH、Web 服务或插件进程；进程隔离、凭证和网络权限由宿主负责。

## 安装

需要 Node.js 20 或更高版本：

```bash
npm install @dsh-plugin-evaluation/portable-runner@0.1.12
```

## 最小示例

```ts
import { runPortableCasePlan } from '@dsh-plugin-evaluation/portable-runner'

const report = await runPortableCasePlan({
  plan: {
    schemaVersion: 1,
    id: 'smoke',
    steps: [{ op: 'plugin.prompt', input: '返回 OK' }],
    metrics: [{ id: 'answer', type: 'output.equals', expected: 'OK' }],
  },
  runPlugin: async ({ input }) => ({ output: input === '返回 OK' ? 'OK' : 'FAIL' }),
})

console.log(report.status) // passed | failed
```

`runPlugin` 是宿主提供的回调，会收到输入、临时工作区、环境变量和会话记录。它可以返回 `output`、`stdout`、`stderr`、`exitCode`、`timedOut`、`files` 和 `toolCalls`。

## CLI

```bash
npx portable-runner \
  --plan ./plan.json \
  --format json \
  --timeout-ms 30000 \
  --command node -- ./plugin-adapter.mjs
```

`--` 后面的内容是外部命令。Runner 通过 `PORTABLE_RUNNER_INPUT_DIR` 和 `PORTABLE_RUNNER_OUTPUT_DIR` 与适配器交换文件。退出码 `0` 表示通过，`1` 表示评测失败，`2` 表示协议或 CLI 错误，`124` 表示超时。

## 常用 API

- `runPortableCasePlan`：执行单个评测方案并返回结构化报告。
- `defineFixture`、`defineCase`、`defineSuite`：组合可复用的夹具、方案和测试套件。
- `createStepRegistry`：注册自定义执行步骤。
- `createMetricRegistry`：注册自定义评测规则。
- `createReporterRegistry`：输出 JSON、Markdown、JUnit 或自定义格式。
- `limits`：限制超时时间、最大步骤数和最大指标数。
- `errorMode: 'report'`：把插件异常转换成 `execution-failed` 检查项。

## 开发与文档

```bash
npm install
npm test
npm run docs:generate
npm run verify
```

快速文档在 [`docs/index.html`](docs/index.html)，完整 API 文档由 TypeDoc 从 TypeScript 源码生成到 [`docs/api`](docs/api/index.html)。

## 发布

更新 `package.json` 版本并创建同名 tag 后推送：

```bash
npm version patch
git push origin main --follow-tags
```

推送 `vX.Y.Z` 后，GitHub Actions 会验证版本、运行测试并通过 npm Trusted Publishing 发布包。

## 安全边界

每次执行使用独立临时工作区，拒绝路径遍历和 NUL 字节，并对证据和输出进行大小限制及敏感值脱敏。宿主仍必须自行限制插件进程、凭证、网络和文件系统权限。

## 许可证

MIT
