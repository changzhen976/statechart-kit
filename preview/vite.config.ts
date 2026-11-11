import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))

/** 独立 preview 应用：把本地 src/vue 与依赖全部打进 dist，运行时不装 node_modules。 */
export default defineConfig({
  root: resolve(here, 'web'),
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === 'scxml-view' || tag === 'scxml-explorer',
        },
      },
    }),
  ],
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
  },
})
