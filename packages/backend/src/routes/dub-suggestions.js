import { Router } from 'express'
import { randomUUID } from 'crypto'
import { dubDb, getDubConfig, logDubAudit } from '../db/dub-tracker.js'
import { getSharedPerfData } from './perf-analysis.js'

const router = Router()

// Dub suggestions now reads from the same shared cache as the Perf Analysis page.
// No separate cache needed — getSharedPerfData() handles disk cache + bg refresh.
const getPerfData = getSharedPerfData
function invalidatePerfCache() { /* shared cache — no-op; perf-analysis manages it */ }

// facts: [adIdx, dayIdx, spend, imp, clicks, lpv, atc, purchases, conv_value, nc, ...]
const F_SPEND = 2, F_CONV_VAL = 8, F_NC = 9, DELIVERY = 0.76

function computeMetrics(payload, lookbackDays) {
  const { ads, facts, days, meta } = payload
  const df = meta?.delivery_factor ?? DELIVERY
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - lookbackDays)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const validDays = new Set(days.reduce((acc, d, i) => { if (d >= cutoffStr) acc.push(i); return acc }, []))
  const byAd = new Map()
  for (const f of facts) {
    if (!validDays.has(f[1])) continue
    let a = byAd.get(f[0])
    if (!a) { a = { spend: 0, conv: 0, nc: 0 }; byAd.set(f[0], a) }
    a.spend += f[F_SPEND] || 0
    a.conv  += f[F_CONV_VAL] || 0
    a.nc    += f[F_NC] || 0
  }
  return ads.map((ad, idx) => {
    const a = byAd.get(idx) || { spend: 0, conv: 0, nc: 0 }
    const roas = a.spend > 0 ? (a.conv * df) / a.spend : 0
    return { ...ad, spend: Math.round(a.spend), nc: Math.round(a.nc),
      roas: Math.round(roas * 1000) / 1000, cac: a.nc > 0 ? Math.round(a.spend / a.nc) : 0 }
  })
}

// ── GET /api/dub-suggestions ──────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { target_language, ad_type } = req.query
    if (!target_language) return res.status(400).json({ error: 'target_language is required' })
    const products = [].concat(req.query.product || [])
    const sources  = [].concat(req.query.source  || [])

    const config  = getDubConfig()
    const payload = await getPerfData()
    const metrics = computeMetrics(payload, config.lookback_days)

    const allRows = dubDb.prepare(
      'SELECT original_ad_name, target_language, status, reject_scope, snooze_until, snooze_count FROM dub_tracker'
    ).all()

    const excludedPairs = new Set(), excludedAll = new Set(), snoozeCounts = new Map()
    const now = new Date().toISOString().slice(0, 10)
    for (const r of allRows) {
      // normalise both sides to lowercase so case mismatches never leak through
      const pair = `${r.original_ad_name.toLowerCase()}|||${r.target_language.toLowerCase()}`
      if (r.status === 'accepted' || r.status === 'dubbed') excludedPairs.add(pair)
      else if (r.status === 'rejected') {
        if (r.reject_scope === 'all') excludedAll.add(r.original_ad_name.toLowerCase())
        else excludedPairs.add(pair)
      } else if (r.status === 'later') {
        snoozeCounts.set(pair, r.snooze_count || 0)
        if (r.snooze_until && r.snooze_until > now) excludedPairs.add(pair)
      }
    }

    // all keys lowercased — ad.n lookups must also be lowercased
    const familyByAd = new Map(
      dubDb.prepare('SELECT original_ad_name, family_id FROM dub_tracker WHERE family_id IS NOT NULL')
        .all().map(r => [r.original_ad_name.toLowerCase(), r.family_id])
    )

    // Auto-detect historically dubbed ads from performance data.
    // If stage1_int_reel_kannada_ai_dubbed_00234 exists in Meta, we know
    // serial 00234 has already been dubbed into Kannada — even if it was never
    // recorded in our tracker. Build a set of "serial|lang" pairs to block.
    const SERIAL_RE = /(\d{3,6})\s*$/
    function extractSerial(name) {
      const m = String(name).toLowerCase().replace(/[\s_]+(si|bca)\s*$/, '').match(SERIAL_RE)
      return m ? m[1] : null
    }
    const alreadyDubbed = new Set()
    for (const ad of metrics) {
      const n = ad.n || ''
      if (!n.includes('_ai_dubbed_')) continue
      const serial = extractSerial(n)
      if (!serial) continue
      // extract language token from the dubbed ad name
      const toks = n.toLowerCase().split(/[_\-]+/)
      const LANGS = new Set(['kannada','telugu','tamil','malayalam','marathi','hindi','english','hinglish','gujarati','punjabi','bengali'])
      const lang = toks.find(t => LANGS.has(t))
      if (lang) alreadyDubbed.add(`${serial}|||${lang}`)
    }

    let pool = metrics.filter(ad => {
      if (ad.spend <= 0) return false
      if (products.length > 0 && !products.some(p =>
        ad.product?.toLowerCase().replace(/[\s_]+/g, '').startsWith(p.toLowerCase().replace(/[\s_]+/g, ''))
      )) return false
      if (ad_type && ad.ad_type?.toLowerCase() !== ad_type.toLowerCase()) return false
      if (sources.length > 0 && !sources.some(s => ad.source?.toLowerCase() === s.toLowerCase())) return false
      if (ad.language?.toLowerCase() === target_language.toLowerCase()) return false
      // non-VO ads have no voiceover to dub — exclude regardless of tracker ad_type
      if (/[\/\-_]non[\-_]?vo([\/\-_]|$)/i.test(ad.n)) return false
      // static image ads have no audio to dub
      if (/[_\-\/]statics?([_\-\/]|$)/i.test(ad.n)) return false
      // carousel ads are image-based, no audio to dub
      if (/carousel/i.test(ad.n) || ad.ad_type?.toLowerCase() === 'carousel') return false
      // already-dubbed ads (artifacts) — agency needs the original, not a re-dub
      if (/_ai_dubbed_/i.test(ad.n)) return false
      // influencer ads are person-specific — can't be dubbed
      if (ad.source?.toLowerCase() === 'inf' || /[_\/]inf[_\/]/i.test(ad.n)) return false
      if (ad.nc < config.nc_threshold) return false
      if (ad.roas < config.roas_threshold / 100) return false
      if (excludedAll.has(ad.n.toLowerCase())) return false
      if (excludedPairs.has(`${ad.n.toLowerCase()}|||${target_language.toLowerCase()}`)) return false
      // block if a dubbed version for this serial + target language already exists in Meta
      const serial = extractSerial(ad.n)
      if (serial && alreadyDubbed.has(`${serial}|||${target_language.toLowerCase()}`)) return false
      return true
    })

    const bestByFamily = new Map(), noFamily = []
    for (const ad of pool) {
      const fid = familyByAd.get(ad.n.toLowerCase())
      if (!fid) { noFamily.push(ad); continue }
      const existing = bestByFamily.get(fid)
      if (!existing || ad.roas > existing.roas) bestByFamily.set(fid, ad)
    }
    pool = [...bestByFamily.values(), ...noFamily]

    const dubbedLangsByAd = new Map()
    for (const r of allRows) {
      if (r.status === 'accepted' || r.status === 'dubbed') {
        const key = r.original_ad_name.toLowerCase()
        if (!dubbedLangsByAd.has(key)) dubbedLangsByAd.set(key, [])
        dubbedLangsByAd.get(key).push(r.target_language)
      }
    }

    const suggestions = pool.sort((a, b) => b.roas - a.roas).slice(0, 100).map(ad => ({
      ad_name: ad.n, product: ad.product, source_language: ad.language || 'Unknown',
      source: ad.source || 'Unknown', ad_type: ad.ad_type || 'Unknown',
      nc: ad.nc, roas: ad.roas, spend: ad.spend, cac: ad.cac,
      live: ad.live || null, drive_link: ad.d || null,
      family_id: familyByAd.get(ad.n.toLowerCase()) || null,
      already_dubbed_languages: dubbedLangsByAd.get(ad.n.toLowerCase()) || [],
      snooze_count: snoozeCounts.get(`${ad.n.toLowerCase()}|||${target_language.toLowerCase()}`) || 0,
      max_snoozes: config.max_snoozes,
    }))

    res.json({ suggestions, target_language, config })
  } catch (err) {
    console.error('[dub-suggestions GET]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/dub-suggestions/accept ─────────────────────────────────────────
router.post('/accept', (req, res) => {
  const { original_ad_name, language } = req.body
  if (!original_ad_name || !language) return res.status(400).json({ error: 'original_ad_name and language required' })
  const user = req.user?.name || req.user?.email || 'unknown'
  try {
    const existing = dubDb.prepare(
      'SELECT * FROM dub_tracker WHERE original_ad_name = ? AND target_language = ?'
    ).get(original_ad_name, language)

    if (existing && (existing.status === 'accepted' || existing.status === 'dubbed'))
      return res.json({ ok: true, idempotent: true, id: existing.id })

    const id = existing?.id || randomUUID()
    const familyId = existing?.family_id || randomUUID()

    if (existing) {
      dubDb.prepare(`UPDATE dub_tracker SET status='accepted', family_id=?, actioned_by=?, updated_at=datetime('now') WHERE id=?`).run(familyId, user, id)
    } else {
      dubDb.prepare(`INSERT INTO dub_tracker (id, family_id, original_ad_name, target_language, status, actioned_by) VALUES (?, ?, ?, ?, 'accepted', ?)`).run(id, familyId, original_ad_name, language, user)
    }
    logDubAudit({ trackerId: id, userId: user, actionType: 'accept', previousState: existing || null, newState: { status: 'accepted' } })
    invalidatePerfCache()
    res.json({ ok: true, id })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── POST /api/dub-suggestions/reject ─────────────────────────────────────────
router.post('/reject', (req, res) => {
  const { original_ad_name, language, scope, reason } = req.body
  if (!original_ad_name || !language) return res.status(400).json({ error: 'original_ad_name and language required' })
  if (!scope || !['language', 'all'].includes(scope)) return res.status(400).json({ error: 'scope must be "language" or "all"' })
  if (!reason?.trim()) return res.status(400).json({ error: 'reason is required' })
  const user = req.user?.name || req.user?.email || 'unknown'
  try {
    const existing = dubDb.prepare('SELECT * FROM dub_tracker WHERE original_ad_name = ? AND target_language = ?').get(original_ad_name, language)
    const id = existing?.id || randomUUID()
    if (existing) {
      dubDb.prepare(`UPDATE dub_tracker SET status='rejected', reject_scope=?, reject_reason=?, actioned_by=?, updated_at=datetime('now') WHERE id=?`).run(scope, reason.trim(), user, id)
    } else {
      dubDb.prepare(`INSERT INTO dub_tracker (id, original_ad_name, target_language, status, reject_scope, reject_reason, actioned_by) VALUES (?, ?, ?, 'rejected', ?, ?, ?)`).run(id, original_ad_name, language, scope, reason.trim(), user)
    }
    logDubAudit({ trackerId: id, userId: user, actionType: 'reject', previousState: existing || null, newState: { status: 'rejected', scope, reason } })
    invalidatePerfCache()
    res.json({ ok: true, id })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── POST /api/dub-suggestions/later ──────────────────────────────────────────
router.post('/later', (req, res) => {
  const { original_ad_name, language } = req.body
  if (!original_ad_name || !language) return res.status(400).json({ error: 'original_ad_name and language required' })
  const user = req.user?.name || req.user?.email || 'unknown'
  try {
    const config = getDubConfig()
    const existing = dubDb.prepare('SELECT * FROM dub_tracker WHERE original_ad_name = ? AND target_language = ?').get(original_ad_name, language)
    const currentCount = existing?.snooze_count || 0
    if (currentCount >= config.max_snoozes) return res.status(400).json({ error: `Max snoozes (${config.max_snoozes}) reached. Accept or Reject this ad.` })
    const snoozeUntil = new Date(); snoozeUntil.setDate(snoozeUntil.getDate() + config.snooze_days)
    const snoozeUntilStr = snoozeUntil.toISOString().slice(0, 10)
    const newCount = currentCount + 1
    const id = existing?.id || randomUUID()
    if (existing) {
      dubDb.prepare(`UPDATE dub_tracker SET status='later', snooze_until=?, snooze_count=?, actioned_by=?, updated_at=datetime('now') WHERE id=?`).run(snoozeUntilStr, newCount, user, id)
    } else {
      dubDb.prepare(`INSERT INTO dub_tracker (id, original_ad_name, target_language, status, snooze_until, snooze_count, actioned_by) VALUES (?, ?, ?, 'later', ?, ?, ?)`).run(id, original_ad_name, language, snoozeUntilStr, newCount, user)
    }
    logDubAudit({ trackerId: id, userId: user, actionType: 'later', previousState: existing || null, newState: { status: 'later', snooze_until: snoozeUntilStr, snooze_count: newCount } })
    res.json({ ok: true, id, snooze_until: snoozeUntilStr, snooze_count: newCount })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── GET /api/dub-suggestions/accepted ────────────────────────────────────────
router.get('/accepted', async (_req, res) => {
  try {
    const rows = dubDb.prepare(
      `SELECT id, original_ad_name, dubbed_ad_name, target_language, status, actioned_by, created_at, updated_at
       FROM dub_tracker WHERE status IN ('accepted','dubbed') ORDER BY updated_at DESC`
    ).all()

    // For dubbed rows, look up performance — non-fatal if perf data unavailable
    const dubbedNames = rows.filter(r => r.dubbed_ad_name && r.dubbed_ad_name !== 'N/A').map(r => r.dubbed_ad_name)
    const dubbedPerf = {}
    if (dubbedNames.length > 0) {
      try {
        const config = getDubConfig()
        const payload = await getPerfData()
        const metrics = computeMetrics(payload, config.lookback_days)
        const byName = new Map(metrics.map(ad => [ad.n, ad]))
        for (const name of dubbedNames) {
          const m = byName.get(name)
          dubbedPerf[name] = m ? { roas: m.roas, nc: m.nc, spend: m.spend, cac: m.cac } : null
        }
      } catch (perfErr) {
        console.warn('[accepted] perf lookup failed, skipping:', perfErr.message)
      }
    }

    res.json({
      accepted: rows.map(r => ({
        ...r,
        dubbed_perf: (r.dubbed_ad_name && r.dubbed_ad_name !== 'N/A') ? (dubbedPerf[r.dubbed_ad_name] ?? null) : null,
      }))
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── POST /api/dub-suggestions/mark-dubbed ────────────────────────────────────
router.post('/mark-dubbed', async (req, res) => {
  const { id, dubbed_ad_name } = req.body
  if (!id || !dubbed_ad_name?.trim()) return res.status(400).json({ error: 'id and dubbed_ad_name required' })
  const user = req.user?.name || req.user?.email || 'unknown'
  try {
    const row = dubDb.prepare('SELECT * FROM dub_tracker WHERE id = ?').get(id)
    if (!row) return res.status(404).json({ error: 'Record not found' })
    const name = dubbed_ad_name.trim()
    // validate: dubbed name must contain the target language token
    if (!name.toLowerCase().includes(row.target_language.toLowerCase())) {
      return res.status(400).json({ error: `Dubbed ad name must contain "${row.target_language}"` })
    }
    dubDb.prepare(`UPDATE dub_tracker SET status='dubbed', dubbed_ad_name=?, actioned_by=?, updated_at=datetime('now') WHERE id=?`).run(name, user, id)
    logDubAudit({ trackerId: id, userId: user, actionType: 'mark_dubbed', previousState: row, newState: { status: 'dubbed', dubbed_ad_name: name } })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── POST /api/dub-suggestions/skip ───────────────────────────────────────────
router.post('/skip', (req, res) => {
  const { id } = req.body
  if (!id) return res.status(400).json({ error: 'id required' })
  const user = req.user?.name || req.user?.email || 'unknown'
  try {
    const row = dubDb.prepare('SELECT * FROM dub_tracker WHERE id = ?').get(id)
    if (!row) return res.status(404).json({ error: 'Record not found' })
    dubDb.prepare(`UPDATE dub_tracker SET status='dubbed', dubbed_ad_name='N/A', actioned_by=?, updated_at=datetime('now') WHERE id=?`).run(user, id)
    logDubAudit({ trackerId: id, userId: user, actionType: 'skip', previousState: row, newState: { status: 'dubbed', dubbed_ad_name: 'N/A' } })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── GET /api/dub-suggestions/rejected ────────────────────────────────────────
router.get('/rejected', (_req, res) => {
  try {
    const now = new Date().toISOString().slice(0, 10)
    const cutoff30 = new Date(); cutoff30.setDate(cutoff30.getDate() - 30)
    const cutoff30Str = cutoff30.toISOString().slice(0, 10)
    const rows = dubDb.prepare(
      `SELECT id, original_ad_name, target_language, reject_scope, reject_reason, actioned_by, updated_at
       FROM dub_tracker WHERE status = 'rejected' ORDER BY updated_at DESC`
    ).all()
    res.json({ rejected: rows.map(r => ({ ...r, can_undo: r.updated_at >= cutoff30Str })) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── POST /api/dub-suggestions/undo-reject ────────────────────────────────────
router.post('/undo-reject', (req, res) => {
  const { id } = req.body
  if (!id) return res.status(400).json({ error: 'id required' })
  const user = req.user?.name || req.user?.email || 'unknown'
  try {
    const row = dubDb.prepare('SELECT * FROM dub_tracker WHERE id = ? AND status = ?').get(id, 'rejected')
    if (!row) return res.status(404).json({ error: 'Rejected record not found' })
    const cutoff30 = new Date(); cutoff30.setDate(cutoff30.getDate() - 30)
    if (row.updated_at < cutoff30.toISOString().slice(0, 10)) return res.status(400).json({ error: 'Undo window expired (30 days)' })
    dubDb.prepare('DELETE FROM dub_tracker WHERE id = ?').run(id)
    logDubAudit({ trackerId: id, userId: user, actionType: 'undo_reject', previousState: row, newState: null })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
