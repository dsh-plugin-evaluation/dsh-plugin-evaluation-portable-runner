# TypeScript 代码规范

Portable Runner 的 TypeScript 代码遵循以下约定：

- 开启 `strict`，不新增 `any`；确需处理外部输入时，在边界处使用 `unknown` 并先校验。
- 所有导出的函数、接口和错误类型都要有明确类型；内部实现也不依赖隐式 `any`。
- 使用 `import`/`export`，不使用 CommonJS；相对导入保留 `.ts` 扩展名，构建产物由 TypeScript 输出 `.js`。
- 不修改调用方传入的对象；registry、environment、evidence 等状态应在运行边界内创建或复制。
- `catch` 中的错误按 `unknown` 处理，使用 `instanceof Error` 或错误码守卫后再读取字段。
- 可选属性使用 `undefined` 语义，不用空字符串或 `null` 代替。
- 对外部插件返回值、JSON、文件路径和工具结果先验证，再进入内部逻辑。
- 每个模块只负责一个边界：校验、workspace、step、metric、执行、报告分别维护。
- 每个 TypeScript 源文件最多 300 行；超过时必须继续按职责拆分。
- 新增行为必须有测试；安全边界和错误码必须有失败路径测试。

提交前运行：

```bash
npm run typecheck
npm run build
npm test
```
