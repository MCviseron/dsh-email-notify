# 贡献指南

感谢你愿意为 `dsh-email-notify` 贡献力量！

## 开发环境

- Node.js `^22.19.0 || >=24`
- pnpm `10.x`
- 一个可用的 DeepSeek Harness 环境（用于本地验证插件加载）

## 常用命令

```sh
pnpm install        # 安装依赖（prepare 钩子会自动构建 lib/）
pnpm typecheck      # TypeScript 类型检查
pnpm build          # 构建 lib/index.js 与 lib/client.js
pnpm check          # typecheck + build
```

## 提交规范

- 提交信息建议遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/)（`feat:`、`fix:`、`docs:` 等）。
- 提交前请保证 `pnpm check` 通过。
- 新增用户可见功能时同步更新 `README.md` 与 `CHANGELOG.md`。

## 分支与 PR

1. `fork` 本仓库并新建功能分支。
2. 在分支上完成修改并自测。
3. 提交 PR，描述清楚动机、改动与测试方式。

## 安全

涉及 SMTP 授权码、收件人等敏感信息时：

- 不要把真实授权码写进代码、配置或提交信息。
- 修改 `src/mailer.ts`、`src/routes.ts` 等与凭据相关代码时，注意保持 loopback 校验。
- 发现安全问题请参考 [SECURITY.md](./SECURITY.md) 的流程处理。
