# 发布与 NPM 认证（P6 前置）

> 目标：发布 `statechart-kit@0.7.0`，之后 creator 改为固定版本依赖，Docker 不再 vendor。
> 本文只写命令与检查，不保存任何 token。

## 1. 发布前置检查

```bash
cd statechart-kit
git status --short          # 必须干净
git log --oneline -3
npm run verify:all          # typecheck + test + build + baseline + vue + pack
npm pack --ignore-scripts --pack-destination /tmp --silent
```

预期：

- 版本 `0.7.0`；
- tarball 包含 `dist/index.js`、`dist/engine.js`、`dist/vue.js`、
  `dist/vue/style.css`、`dist/vue-types/**`；
- `check:pack` 输出 `pack ok: exports resolve, d.ts present, version consistent`。

## 2. NPM 认证（交互式，只在本机执行）

```bash
cd statechart-kit
npm login --auth-type=web
npm whoami
npm config get registry       # 应为 https://registry.npmjs.org/
```

- 如果账号启用了 2FA，`npm publish` 会提示 OTP。
- 不要把 token 写进 `.npmrc` 后提交；本仓库不包含任何认证文件。

## 3. 发布

```bash
cd statechart-kit
npm publish --access public
```

`package.json` 已配置：

- `prepublishOnly: npm run verify:all`（发布前再跑一遍全量验证）
- `prepack: npm run build`（保证 tarball 内是新鲜 dist）
- `publishConfig.access: public`

如果需要先看发布内容（不会真正上传）：

```bash
npm publish --dry-run --access public
```

## 4. 发布后验证

```bash
npm view statechart-kit@0.7.0 version dist.tarball
npm view statechart-kit dist-tags
```

然后在临时目录验证安装：

```bash
cd /tmp
rm -rf kit-probe && mkdir kit-probe && cd kit-probe
npm init -y >/dev/null
npm install statechart-kit@0.7.0
node --input-type=module -e "import('statechart-kit').then(m=>console.log('core', Object.keys(m).length)); import('statechart-kit/vue').then(()=>console.log('vue ok'))"
```

## 5. 打 tag（发布前/后均可，必须与 package.json 一致）

```bash
cd statechart-kit
git tag -d v0.7.0 2>/dev/null || true
git push origin :refs/tags/v0.7.0 2>/dev/null || true
git tag -a v0.7.0 -m "statechart-kit 0.7.0: generic variable/event attrs"
git push origin v0.7.0
```

> 仅在 `v0.7.0` 尚未发布到 npm 时重打 tag；如果已经发布，不要移动 tag，
> 改用新版本号 `0.7.1`，避免 tag 与已发布内容不一致。

## 6. 发布后 creator 的切换（P6 后续）

```bash
cd ../scxml-creator
npm install --save statechart-kit@^0.7.0
git diff package.json package-lock.json
npm run typecheck && npm run test:all && npm run check:all
git add package.json package-lock.json
git commit -m "chore: use published statechart-kit 0.7.0"
```

切换后：

- 删除 `scripts/stage-deploy.sh` 的 vendor 逻辑，或保留脚本但改为不 vendor；
- Dockerfile 回到普通 `npm ci`，不再需要 `COPY vendor`；
- 重新构建并部署远程容器。

## 7. 回滚

- npm 不支持原地覆盖已发布版本；发现严重问题时发布新的 patch 版本。
- 保留发布前 tag 与 tarball（`npm pack` 的 `.tgz` 可用于本地回放安装）。
- 远程容器回滚使用 `/opt/scxmljs-creator/backup/source-before-*.tar.gz`。
