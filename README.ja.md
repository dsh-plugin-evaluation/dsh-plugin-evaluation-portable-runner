# @dsh-plugin-evaluation/portable-runner

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

ホスト環境に依存しない DSH Portable Case Plan（移植可能な評価プラン）実行エンジンです。

## 目的

一時ワークスペースの作成、準備ステップ、ホストが提供するプラグイン関数の呼び出し、メトリクス評価、終了後のクリーンアップを担当します。DSH、Web サーバー、プラグインプロセス自体は起動しません。プロセス分離、認証情報、ネットワーク権限はホスト側で管理します。

## インストール

Node.js 20 以上が必要です。

```bash
npm install @dsh-plugin-evaluation/portable-runner@0.1.10
```

## 最小例

```ts
import { runPortableCasePlan } from '@dsh-plugin-evaluation/portable-runner'

const report = await runPortableCasePlan({
  plan: {
    schemaVersion: 1,
    id: 'smoke',
    steps: [{ op: 'plugin.prompt', input: 'OK を返してください' }],
    metrics: [{ id: 'answer', type: 'output.equals', expected: 'OK' }],
  },
  runPlugin: async () => ({ output: 'OK' }),
})

console.log(report.status) // passed | failed
```

`runPlugin` はホストが提供するコールバックです。入力、専用ワークスペース、環境変数、セッション履歴を受け取り、出力や終了コードなどを返します。

## CLI

```bash
npx portable-runner \
  --plan ./plan.json \
  --format json \
  --timeout-ms 30000 \
  --command node -- ./plugin-adapter.mjs
```

`--` の後ろは外部コマンドです。アダプターとは `PORTABLE_RUNNER_INPUT_DIR` と `PORTABLE_RUNNER_OUTPUT_DIR` のファイルプロトコルで通信します。終了コード `0` は成功、`1` は評価失敗、`2` は CLI またはプロトコルエラー、`124` はタイムアウトです。

## 主な API

- `runPortableCasePlan`：一つの評価プランを実行します。
- `defineFixture`、`defineCase`、`defineSuite`：再利用可能な評価を組み立てます。
- `createStepRegistry`：カスタム実行ステップを登録します。
- `createMetricRegistry`：カスタム評価ルールを登録します。
- `createReporterRegistry`：JSON、Markdown、JUnit、または独自形式で出力します。
- `limits`：タイムアウト、最大ステップ数、最大メトリクス数を設定します。
- `errorMode: 'report'`：プラグイン例外を `execution-failed` チェックに変換します。

## 開発とドキュメント

```bash
npm install
npm test
npm run docs:generate
npm run verify
```

概要は [`docs/index.html`](docs/index.html)、完全な API リファレンスは TypeDoc により [`docs/api`](docs/api/index.html) に生成されます。

## リリース

バージョンを更新して同じ名前のタグを push すると、GitHub Actions が検証と npm 公開を行います。

```bash
npm version patch
git push origin main --follow-tags
```

## セキュリティ境界

実行ごとに一時ワークスペースを作成し、パスの走査や NUL バイトを拒否します。証拠と出力にはサイズ制限と秘密値のマスキングを適用します。プラグインのプロセス、認証情報、ネットワーク、ファイルシステム権限はホスト側で制限してください。

## ライセンス

MIT
