import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

/**
 * Vue 编辑器独立构建（P3）。
 * tsup 负责 core/engine/policies 的 ESM + d.ts；Vite 负责 SFC 编译与 dist/vue.js。
 * 两者共用 dist（vite 的 emptyOutDir=false，避免清掉 tsup 产物）。
 */
export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // 官方 Web Component：不能被当成 Vue 组件解析
          isCustomElement: (tag) => tag === 'scxml-view',
        },
      },
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      entry: resolve('src/vue/index.ts'),
      formats: ['es'],
      fileName: () => 'vue.js',
      // SFC scoped CSS + global styles.css 合并为一个可显式 import 的文件
      cssFileName: 'vue/style',
    },
    rollupOptions: {
      external: [
        'vue',
        '@tinyactors/scxmljs',
        '@tinyactors/scxmljs/view',
        '@tinyactors/scxmljs/trusted',
      ],
    },
  },
})
