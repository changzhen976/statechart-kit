#!/usr/bin/env node
/**
 * statechart-kit preview 容器的最小静态服务器。
 *
 * - `/`、`/assets/*` 提供 Vite 构建产物；
 * - `/api/latest` 读取 DATA_DIR 下最新的 .scxml/.json，返回原文给浏览器解析；
 * - `/health` 供 Docker healthcheck 使用。
 *
 * 只依赖 Node 内置模块，运行阶段不需要 node_modules。
 */
import { createServer } from 'node:http'
import { readFile, readdir, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, extname, join, normalize, sep } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = process.env.DIST_DIR || join(here, 'dist')
const dataDir = process.env.DATA_DIR || join(here, 'data')
const port = Number(process.env.PORT || 5182)
const host = process.env.HOST || '0.0.0.0'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

async function fileInfo(path) {
  try {
    const info = await stat(path)
    return info.isFile() ? info : null
  } catch {
    return null
  }
}

/** 优先 latest.scxml / latest.json；否则取目录里最新的 .scxml/.json。 */
async function pickLatest() {
  const preferred = ['latest.scxml', 'latest.json']
  for (const name of preferred) {
    const path = join(dataDir, name)
    const info = await fileInfo(path)
    if (info) return { name, path, mtime: info.mtime }
  }
  let entries
  try {
    entries = await readdir(dataDir, { withFileTypes: true })
  } catch {
    return null
  }
  const candidates = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const ext = extname(entry.name).toLowerCase()
    if (ext !== '.scxml' && ext !== '.json') continue
    const path = join(dataDir, entry.name)
    const info = await fileInfo(path)
    if (info) candidates.push({ name: entry.name, path, mtime: info.mtime })
  }
  candidates.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
  return candidates[0] ?? null
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

async function handleLatest(res) {
  const latest = await pickLatest()
  if (!latest) {
    sendJson(res, 404, {
      error: `data 目录中没有 .scxml/.json：${dataDir}`,
    })
    return
  }
  const text = await readFile(latest.path, 'utf8')
  const ext = extname(latest.name).toLowerCase()
  sendJson(res, 200, {
    kind: ext === '.json' ? 'json' : 'scxml',
    name: latest.name,
    text,
    mtime: latest.mtime.toISOString(),
  })
}

async function handleStatic(req, res) {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname)
  } catch {
    res.writeHead(400).end('bad path')
    return
  }
  if (pathname === '/' || pathname === '') pathname = '/index.html'
  const relative = normalize(pathname).replace(/^([/\\])+/, '')
  const file = join(distDir, relative)
  if (!file.startsWith(`${distDir}${sep}`) && file !== distDir) {
    res.writeHead(404).end('not found')
    return
  }
  try {
    const body = await readFile(file)
    const ext = extname(file).toLowerCase()
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': relative === 'index.html' ? 'no-store' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    })
    res.end(body)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found')
  }
}

const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('ok')
      return
    }
    if (pathname === '/api/latest') {
      await handleLatest(res)
      return
    }
    await handleStatic(req, res)
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
  }
})

server.listen(port, host, () => {
  console.log(`statechart preview listening on http://${host}:${port}`)
  console.log(`  dist: ${distDir}`)
  console.log(`  data: ${dataDir}`)
})
