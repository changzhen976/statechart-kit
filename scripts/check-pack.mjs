/**
 * 打包冒烟：证明发布出去的东西真的能被 Node 按 exports map 解析。
 *
 * 步骤：
 *   1. npm pack 出 tarball（--ignore-scripts，避免重复 build）；
 *   2. 解包到临时目录的 node_modules/statechart-kit；
 *   3. 把本仓的 @tinyactors 软链过去（它是 external，不入包）；
 *   4. 在临时目录里 `import('statechart-kit')` 与 `import('statechart-kit/engine')`，
 *      断言导出确实存在、d.ts 确实在包里。
 *
 * 这是 P0 唯一的「构建链真的可用」证据，CI 必跑。
 */
import { execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tmp = await mkdtemp(join(tmpdir(), 'statechart-kit-pack-'))

try {
  // npm 的默认 cache/logs 目录在只读环境（CI 容器、沙箱）里会 EROFS；
  // 一律指到本次临时目录，保证脚本在任何环境下都能跑。
  execFileSync(
    'npm',
    [
      'pack',
      '--ignore-scripts',
      '--pack-destination',
      tmp,
      '--cache',
      join(tmp, 'npm-cache'),
      '--logs-dir',
      join(tmp, 'npm-logs'),
      '--silent',
    ],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' },
  )
  const tarball = (await readdir(tmp)).find((f) => f.endsWith('.tgz'))
  if (!tarball) throw new Error('npm pack 没有产出 tarball')

  const extract = join(tmp, 'extract')
  await mkdir(extract, { recursive: true })
  execFileSync('tar', ['-xzf', join(tmp, tarball), '-C', extract])

  const appModules = join(tmp, 'app', 'node_modules')
  await mkdir(appModules, { recursive: true })
  await cp(join(extract, 'package'), join(appModules, 'statechart-kit'), { recursive: true })

  const scoped = join(appModules, '@tinyactors')
  await mkdir(scoped, { recursive: true })
  await symlink(join(root, 'node_modules', '@tinyactors', 'scxmljs'), join(scoped, 'scxmljs'), 'dir')
  await symlink(
    join(root, 'node_modules', '@tinyactors', 'scxmljs', 'node_modules'),
    join(scoped, 'scxmljs', 'node_modules'),
    'dir',
  ).catch(() => {})

  const probe = join(tmp, 'app', 'probe.mjs')
  await cp(new URL('./pack-probe.mjs', import.meta.url), probe)

  const out = execFileSync('node', [probe], { cwd: join(tmp, 'app'), encoding: 'utf8' })
  process.stdout.write(out)

  const pkgDir = join(appModules, 'statechart-kit')
  for (const rel of [
    'dist/index.js',
    'dist/index.d.ts',
    'dist/engine.js',
    'dist/engine.d.ts',
    'dist/diagnostics/zh.js',
    'dist/diagnostics/zh.d.ts',
    'dist/vue.js',
    'dist/vue/style.css',
    'dist/vue-types/vue/index.d.ts',
  ]) {
    if (!existsSync(join(pkgDir, rel))) throw new Error(`发布包缺少 ${rel}`)
  }
  const published = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8'))
  if (published.version !== JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version) {
    throw new Error('tarball 内版本与工作区版本不一致（是否忘了 build？）')
  }

  console.log('pack ok: exports resolve, d.ts present, version consistent')
} finally {
  await rm(tmp, { recursive: true, force: true })
}
