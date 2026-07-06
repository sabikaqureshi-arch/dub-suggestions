// Sync AI Video Requests sheet → dub_tracker.db
// Run: node sync-sheet.mjs
// Safe to re-run — skips rows already in DB.

import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'crypto'

const SHEET_ID  = '1MG1gq34456_QCu-4DZp8aU8__pNs0PxABRvfEVQokDk'
const SHEET_GID = '0'
const CSV_URL   = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`

const VALID_LANGS = new Set(['kannada','telugu','tamil','malayalam','marathi','hindi'])

// ── Fetch CSV (native fetch follows all redirects) ────────────────────────────
async function fetchCSV(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

// ── Parse CSV line respecting quoted fields ───────────────────────────────────
function parseLine(line) {
  const result = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++ }
      else inQ = !inQ
    } else if (c === ',' && !inQ) {
      result.push(cur.trim()); cur = ''
    } else {
      cur += c
    }
  }
  result.push(cur.trim())
  return result
}

// ── Main ─────────────────────────────────────────────────────────────────────
console.log('Fetching sheet…')
const csv = await fetchCSV(CSV_URL)
const lines = csv.split('\n').map(l => l.replace(/\r$/, ''))

// Sheet columns (0-indexed):
// 0=empty  1=Date  2=AdName  3=Stage  4=POC  5=DriveLink  6=Language
// 7=sep    8=DubbedDate  9=DubbedDriveLink  10=Tokens  11=Cost  12=Language(dup)

const rows = []
for (const line of lines) {
  if (!line.trim()) continue
  const cols = parseLine(line)
  const adName = cols[2]?.trim()
  const lang   = cols[6]?.trim()
  if (!adName || adName === 'Adname' || adName === '-' || adName === '') continue
  if (!lang || !VALID_LANGS.has(lang.toLowerCase())) continue
  // Capitalise lang properly
  const language = lang.charAt(0).toUpperCase() + lang.slice(1).toLowerCase()
  rows.push({ original_ad_name: adName, target_language: language })
}

console.log(`Parsed ${rows.length} request rows from sheet`)

const db = new DatabaseSync('./dub_tracker.db')

const check  = db.prepare('SELECT id, status FROM dub_tracker WHERE original_ad_name = ? AND target_language = ?')
const insert = db.prepare(`INSERT INTO dub_tracker (id, original_ad_name, target_language, status, actioned_by, created_at, updated_at)
  VALUES (?, ?, ?, 'accepted', 'sheet_import', datetime('now'), datetime('now'))`)

let inserted = 0, skipped = 0, alreadyAccepted = 0

for (const { original_ad_name, target_language } of rows) {
  const existing = check.get(original_ad_name, target_language)
  if (existing) {
    if (existing.status === 'accepted' || existing.status === 'dubbed') alreadyAccepted++
    else skipped++
    continue
  }
  insert.run(randomUUID(), original_ad_name, target_language)
  inserted++
}

db.close()

console.log(`\nDone.`)
console.log(`  Inserted:          ${inserted}`)
console.log(`  Already accepted:  ${alreadyAccepted}`)
console.log(`  Skipped (other):   ${skipped}`)
console.log(`\nOpen the Accepted tab in MindMatters to see all imported rows.`)
console.log(`Paste dubbed ad names there as they go live.`)
