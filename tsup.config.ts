import { defineConfig } from 'tsup'

/**
 * 入口与 package.json 的 exports 一一对应：
 *   .               → src/core          （零运行时依赖）
 *   ./engine        → src/engine        （依赖 @tinyactors/scxmljs）
 *   ./policies/server → src/policies    （服务端命名策略预设，不属于 core）
 * ./vue 入口在 P3 加入（需要 Vite + vue 插件，届时拆独立构建）。
 */
export default defineConfig({
  entry: {
    index: 'src/core/index.ts',
    engine: 'src/engine/index.ts',
    'policies/server': 'src/policies/server.ts',
  },
  format: ['esm'],
  target: 'node20',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  treeshake: true,
})
