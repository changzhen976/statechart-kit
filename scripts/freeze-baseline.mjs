/**
 * 冻结基线：记录受保护文件的 sha256 与 donor 出处。
 *
 * P0 的目的：证明「本仓 src 与 donor 同字节」，任何手改都会被 check:baseline 抓到。
 * P1 的目的：本仓成为独立事实源；只对 `DONOR_MIRRORED` 保留 donor 同字节断言，
 * 其余文件冻结当前内容，防止后续无意改动。
 *
 * 用法：npm run freeze:baseline
 * 环境：DONOR_ROOT 可覆盖 donor 路径（默认 ../scxml-creator）
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DONOR_DIVERGED, DONOR_EXCLUDED, DONOR_MIRRORED, KIT_FILES } from './snapshot-files.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const donorRoot = resolve(process.env.DONOR_ROOT || resolve(root, '..', 'scxml-creator'))

const sha256 = (text) => createHash('sha256').update(text).digest('hex')

function git (args) {
  try {
    return execFileSync('git', ['-C', donorRoot, ...args], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

const hashes = {}
for (const file of KIT_FILES) {
  hashes[file] = sha256(await readFile(resolve(root, file)))
}

const baseline = {
  schema: 2,
  generatedAt: new Date().toISOString(),
  package: 'statechart-kit',
  phase: 'P3 (embedded Vue editor: EditorHost, features, mountEditor, styles)',
  donor: {
    name: 'scxml-creator',
    path: donorRoot,
    head: git(['log', '-1', '--format=%h']),
    headDate: git(['log', '-1', '--format=%ad', '--date=short']),
    coreCommit: git(['log', '-1', '--format=%h', '--', 'src/core']),
    coreCommitDate: git(['log', '-1', '--format=%ad', '--date=short', '--', 'src/core']),
    engineCommit: git(['log', '-1', '--format=%h', '--', 'src/engine']),
    engineCommitDate: git(['log', '-1', '--format=%ad', '--date=short', '--', 'src/engine']),
    clean: git(['status', '--porcelain', '--', 'src/core', 'src/engine']) === '',
  },
  hashes,
  mirrored: DONOR_MIRRORED,
  diverged: DONOR_DIVERGED,
  excluded: DONOR_EXCLUDED,
}

await writeFile(resolve(root, 'docs/baseline.json'), JSON.stringify(baseline, null, 2) + '\n')
console.log(
  `baseline frozen: ${KIT_FILES.length} files, ${DONOR_MIRRORED.length} mirrored, ` +
    `${DONOR_DIVERGED.length} diverged @ donor ${baseline.donor.coreCommit ?? '?'}`,
)
