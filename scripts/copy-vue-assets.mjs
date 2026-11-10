/**
 * 把编辑器的全局样式复制到发布目录。
 * 组件不写 scoped style——所有样式集中在 src/vue/styles.css，避免 Vite 再产出一份
 * 无法被宿主显式引用的 CSS。
 */
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
await mkdir(resolve(root, 'dist/vue'), { recursive: true })
await copyFile(resolve(root, 'src/vue/styles.css'), resolve(root, 'dist/vue/style.css'))
console.log('vue assets: dist/vue/style.css')
