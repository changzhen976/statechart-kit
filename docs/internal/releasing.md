# 发布与 NPM 认证（维护者）

> 目标：发布 `statechart-kit` 0.13.x。当前已发布 `0.12.0`；下文以 `0.13.0` 为例，
> 实际发布时替换成 `package.json` 里的版本号。本文只写命令与检查，不保存任何 token。

## 0. 远程约定

| 远程 | 用途 | 推送内容 |
| --- | --- | --- |
| `origin` | 内部 Gitea（团队工作区） | `main` + tag |
| `github` | 公开镜像 `changzhen976/statechart-kit` | `main` + tag |

至少保证公开镜像与 npm 发布内容一致；`git push github main --tags` 是当前默认做法。

## 1. 发布前置检查

```bash
cd statechart-kit
git status --short          # 必须干净
node -p "require('./package.json').version"
npm run verify:all          # typecheck + test + build + baseline + vue + pack
npm pack --pack-destination /tmp --silent
```

预期：

- 版本与准备发布的版本一致；
- tarball 包含 `dist/index.js`、`dist/engine.js`、`dist/vue.js`、
  `dist/vue/style.css`、`dist/vue-types/**`；
- `check:pack` 输出 `pack ok: exports resolve, d.ts present, version consistent`。

> `dist/` 不提交。不要用 `npm pack --ignore-scripts` 检查旧 `dist/`；`npm pack` 会通过
> `prepack` 重新构建。发布前以 `npm run verify:all` 为准。

## 2. NPM 认证（交互式，只在本机执行）

```bash
cd statechart-kit
npm login --auth-type=web
npm whoami
npm config get registry       # 应为 https://registry.npmjs.org/
```

- 如果账号启用了 2FA，`npm publish` 会提示 OTP；
- 不要把 token 写进仓库内的 `.npmrc`；本仓库不包含认证文件；
- 发布过程建议放在 `tmux` / `screen` 里，避免终端断开导致上传中断。

## 3. 发布

```bash
cd statechart-kit
npm publish --access public
```

`package.json` 已配置：

- `prepublishOnly: npm run verify:all`（发布前再跑一遍全量验证）
- `prepack: npm run build`（保证 tarball 内是新鲜 dist）
- `publishConfig.access: public`

发布成功时 npm 会输出：

```text
+ statechart-kit@x.y.z
npm notice Your package is being processed and may take a few minutes to become available.
```

“being processed” 期间 registry 可能仍返回 404，不要立即重复 publish。

### 发布前预演

```bash
npm publish --dry-run --access public
```

0.9.1 起 `check:pack` 会清除嵌套 `npm pack` 继承的 `npm_config_dry_run`，
因此该命令可以正常完成；如果旧版本报 `npm pack 没有产出 tarball`，先升级仓库脚本。

## 4. 发布后验证

```bash
npm view statechart-kit@x.y.z version dist.tarball dist.fileCount
npm view statechart-kit dist-tags
```

在干净目录验证安装与入口：

```bash
cd /tmp
rm -rf kit-probe && mkdir kit-probe && cd kit-probe
npm init -y >/dev/null
npm install statechart-kit@x.y.z
node --input-type=module -e "import('statechart-kit').then(m=>console.log('core', Object.keys(m).length)); import('statechart-kit/engine').then(m=>console.log('engine', typeof m.SessionRunner))"
```

`statechart-kit/vue` 依赖 DOM 与 Vue peer，建议在浏览器或 `happy-dom` 中验证，
不要在纯 Node 探针里直接 import。

## 5. 打 tag（发布前/后均可，必须与 package.json 一致）

```bash
cd statechart-kit
git tag v0.10.0
git push github main --tags
# 需要内部镜像时：
git push origin main --tags
```

> tag 一旦对应版本已发布到 npm，就不要再移动；需要修正时发布新的 patch 版本。
> 删除/重打 tag 只允许在尚未发布时进行。

## 6. 发布后 creator 的切换

```bash
cd ../scxml-creator
npm install --save statechart-kit@^0.10.0
git diff package.json package-lock.json
npm run typecheck && npm run test:all && npm run check:all
```

0.9.x 起 `TransitionEdge.target` 可为 `null`，`ListenEdge.target` /
`EventOrigin.target` 也同步可空。creator 中类似
`stateName(t.target)`、直接读取 `t.target.id` 的代码需要先适配；必要时显示“内部转移”。

切换后：

- 删除 `scripts/stage-deploy.sh` 的 vendor 逻辑，或保留脚本但改为不 vendor；
- Dockerfile 回到普通 `npm ci`，不再需要 `COPY vendor`；
- 重新构建并部署远程容器。

## 7. 回滚

- npm 不支持原地覆盖已发布版本；发现严重问题时发布新的 patch 版本；
- 保留发布前 tag 与 tarball（`npm pack` 的 `.tgz` 可用于本地回放安装）；
- 远程容器回滚使用 `/opt/scxmljs-creator/backup/source-before-*.tar.gz`。

## 8. 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `npm pack 没有产出 tarball` | 嵌套 `npm pack` 继承了 `npm_config_dry_run` | 0.9.1 已修；旧版本执行前 `unset npm_config_dry_run` |
| 发布后 `npm view` 仍 404 | registry 仍在 processing | 等 1–3 分钟，用 cache-buster 复查，不要重复发布 |
| `cannot publish over previously published version` | 该版本已存在 | 说明上传已成功，或改用新 patch 版本 |
| 2FA 通过但终端断开 | 上传/处理被中断 | 用 `tmux` 重跑，先查 registry 再决定是否重发 |
