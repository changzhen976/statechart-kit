/**
 * 校验本仓仍与 P0 基线一致。
 *
 *   npm run check:baseline            只校验本仓（自包含，CI 用）
 *   npm run check:baseline -- --donor 额外逐字节比对 donor 工作区
 *
 * 退出码 1 表示漂移：要么有人手改了快照文件，要么 donor 已经前进需要重新同步。
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const donorRoot = resolve(process.env.DONOR_ROOT || resolve(root, '..', 'scxml-creator'))
const withDonor = process.argv.includes('--donor')

const baseline = JSON.parse(await readFile(resolve(root, 'docs/baseline.json'), 'utf8'))
const sha256 = (text) => createHash('sha256').update(text).digest('hex')

/** test/ 下的验证脚本在 donor 里位于 scripts/ */
const donorPathFor = (file) => (file.startsWith('test/') ? `scripts/${file.slice('test/'.length)}` : file)

const problems = []

for (const [file, expected] of Object.entries(baseline.hashes)) {
  let text
  try {
    text = await readFile(resolve(root, file), 'utf8')
  } catch {
    problems.push(`${file}：文件缺失`)
    continue
  }
  if (sha256(text) !== expected) {
    problems.push(`${file}：本仓内容与基线不一致（疑似手改）`)
    continue
  }
  if (withDonor) {
    try {
      const donorText = await readFile(resolve(donorRoot, donorPathFor(file)), 'utf8')
      if (donorText !== text) problems.push(`${file}：与 donor ${donorPathFor(file)} 已不同步`)
    } catch {
      problems.push(`${file}：读取 donor ${donorPathFor(file)} 失败（donor 工作区不可用？）`)
    }
  }
}

if (problems.length) {
  console.error('baseline check failed:')
  for (const p of problems) console.error(`  ✗ ${p}`)
  console.error('\n如为有意变更，请先改 donor，再重新同步并执行 npm run freeze:baseline。')
  process.exit(1)
}

const scope = withDonor ? '本仓 + donor' : '本仓'
console.log(`baseline ok: ${Object.keys(baseline.hashes).length} files match (${scope}, donor ${baseline.donor.coreCommit ?? '?'})`)
