import { Router } from 'express'
import fs from 'fs/promises'
import { readFileSync } from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { buildPerfData } from '../services/perf-analysis/build-data.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = path.resolve(__dirname, '../../.cache')
const CACHE_FILE = path.join(CACHE_DIR, 'perf-analysis.json')
const BUILD_SRC = path.resolve(__dirname, '../services/perf-analysis/build-data.js')

// Hash of the ETL source. A cache built by different code (i.e. after a deploy)
// has a different hash, so it is treated as stale and rebuilt automatically —
// this is what stops a deploy from serving the old cached JSON.
const CODE_HASH = (() => {
  try { return crypto.createHash('sha1').update(readFileSync(BUILD_SRC)).digest('hex').slice(0, 12) }
  catch { return 'dev' }
})()
const MAX_AGE_MS = 6 * 60 * 60 * 1000 // rebuild in the background if older than 6h

const router = Router()

let memCache = null      // last built payload
let building = null      // in-flight build promise (rebuild lock)

async function readDiskCache() {
  try { return JSON.parse(await fs.readFile(CACHE_FILE, 'utf8')) }
  catch { return null }
}

async function writeDiskCache(payload) {
  await fs.mkdir(CACHE_DIR, { recursive: true })
  await fs.writeFile(CACHE_FILE, JSON.stringify(payload))
}

const rebuildCallbacks = []
export function onPerfRebuild(cb) { rebuildCallbacks.push(cb) }

async function rebuild() {
  if (building) return building            // coalesce concurrent rebuilds
  building = (async () => {
    const t0 = Date.now()
    const payload = await buildPerfData({ log: (m) => console.log('[perf-analysis]', m) })
    payload.meta.code_hash = CODE_HASH
    await writeDiskCache(payload)
    memCache = payload
    console.log(`[perf-analysis] rebuilt in ${((Date.now() - t0) / 1000).toFixed(1)}s (code ${CODE_HASH})`)
    for (const cb of rebuildCallbacks) cb(payload).catch(e => console.error('[post-rebuild cb]', e.message))
    return payload
  })()
  try { return await building } finally { building = null }
}

const sameCode = (p) => p && p.meta && p.meta.code_hash === CODE_HASH
const ageMs = (p) => Date.now() - Date.parse(p?.meta?.generated || 0)

// GET /api/perf-analysis/data — cached payload, self-invalidating on code change
router.get('/data', async (_req, res) => {
  try {
    if (!memCache) memCache = await readDiskCache()
    if (sameCode(memCache)) {
      // same ETL code: serve immediately; refresh in the background if stale
      if (ageMs(memCache) > MAX_AGE_MS && !building) rebuild().catch((e) => console.error('[perf-analysis] bg rebuild:', e.message))
      return res.json(memCache)
    }
    // no cache, or cache built by older code (post-deploy) → rebuild now
    res.json(await rebuild())
  } catch (err) {
    console.error('[perf-analysis] data error:', err.message)
    res.status(500).json({ error: { message: err.message } })
  }
})

// POST /api/perf-analysis/refresh — force re-pull from the umbrella sheet
router.post('/refresh', async (_req, res) => {
  try {
    res.json(await rebuild())
  } catch (err) {
    console.error('[perf-analysis] refresh error:', err.message)
    res.status(500).json({ error: { message: err.message } })
  }
})

// Shared accessor for other routes (e.g. dub-suggestions) — same cache, same data
export async function getSharedPerfData() {
  if (!memCache) memCache = await readDiskCache()
  if (sameCode(memCache)) {
    if (ageMs(memCache) > MAX_AGE_MS && !building) rebuild().catch(e => console.error('[perf-analysis] bg rebuild:', e.message))
    return memCache
  }
  return rebuild()
}

export default router
