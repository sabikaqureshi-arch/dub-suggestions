import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.resolve(__dirname, '../../dub_tracker.db')

export const dubDb = new DatabaseSync(DB_PATH)

dubDb.exec(`PRAGMA journal_mode = WAL`)
dubDb.exec(`PRAGMA foreign_keys = ON`)

dubDb.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dub_tracker (
    id               TEXT PRIMARY KEY,
    family_id        TEXT,
    original_ad_name TEXT NOT NULL,
    dubbed_ad_name   TEXT,
    target_language  TEXT NOT NULL,
    status           TEXT NOT NULL CHECK(status IN ('accepted','dubbed','rejected','later')),
    reject_scope     TEXT CHECK(reject_scope IN ('language','all')),
    reject_reason    TEXT,
    snooze_until     TEXT,
    snooze_count     INTEGER DEFAULT 0,
    actioned_by      TEXT NOT NULL,
    created_at       TEXT DEFAULT (datetime('now')),
    updated_at       TEXT DEFAULT (datetime('now')),
    UNIQUE(original_ad_name, target_language)
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id             TEXT PRIMARY KEY,
    tracker_id     TEXT,
    user_id        TEXT NOT NULL,
    action_type    TEXT NOT NULL,
    previous_state TEXT,
    new_state      TEXT,
    created_at     TEXT DEFAULT (datetime('now'))
  );
`)

const insertConfig = dubDb.prepare(`INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)`)
for (const [k, v] of [
  ['roas_threshold', '60'],
  ['nc_threshold',   '10'],
  ['lookback_days',  '40'],
  ['snooze_days',    '7'],
  ['max_snoozes',    '3'],
]) insertConfig.run(k, v)

const SEED = [
  { date: '2026-06-16', ad: 'stage3_bof_affluence_reel_hindi_rounak_ajamani_results/assurance_ugc_00315',                   by: 'Sutanto', lang: 'Kannada' },
  { date: '2026-06-16', ad: 'stage3_bof_affluence_reel_hindi_rounak_ajamani_results/assurance_ugc_00315',                   by: 'Sutanto', lang: 'Telugu'  },
  { date: '2026-06-16', ad: 'stage3_bof_affluence_reel_hindi_rounak_ajamani_results/assurance_ugc_00315',                   by: 'Sutanto', lang: 'Marathi' },
  { date: '2026-06-17', ad: 'stage2_bof_affluence_reel_hindi_saurabh_pandey_results/assurance_ugc_00374',                   by: 'Sutanto', lang: 'Kannada' },
  { date: '2026-06-17', ad: 'stage2_bof_affluence_reel_hindi_saurabh_pandey_results/assurance_ugc_00374',                   by: 'Sutanto', lang: 'Telugu'  },
  { date: '2026-06-17', ad: 'stage2_bof_affluence_reel_hindi_saurabh_pandey_results/assurance_ugc_00374',                   by: 'Sutanto', lang: 'Marathi' },
  { date: '2026-06-17', ad: 'stage3_bof_affluence_reel_english_avinas_beforeafter_testimonial_00107',                       by: 'Pranav',  lang: 'Telugu'  },
  { date: '2026-06-17', ad: 'stage3_bof_affluence_reel_english_avinas_beforeafter_testimonial_00107',                       by: 'Pranav',  lang: 'Kannada' },
  { date: '2026-06-17', ad: 'stage3_bof_affluence_reel_english_avinas_beforeafter_testimonial_00107',                       by: 'Pranav',  lang: 'Marathi' },
  { date: '2026-06-17', ad: 'stage3_bof_affluence_reel_english_avinas_results/assurance/productfirst_testimonial_00155_SI', by: 'Pranav',  lang: 'Kannada' },
  { date: '2026-06-17', ad: 'stage3_bof_affluence_reel_english_avinas_results/assurance/productfirst_testimonial_00155_SI', by: 'Pranav',  lang: 'Telugu'  },
  { date: '2026-06-17', ad: 'stage3_bof_affluence_reel_english_avinas_results/assurance/productfirst_testimonial_00155_SI', by: 'Pranav',  lang: 'Marathi' },
  { date: '2026-06-18', ad: 'stage2_mof_int_reel_hindi_dr._raj_parikh_stages_podcast_00102',                                by: 'Aniket',  lang: 'Kannada' },
  { date: '2026-06-18', ad: 'stage2_mof_int_reel_hindi_dr._raj_parikh_stages_podcast_00102',                                by: 'Aniket',  lang: 'Telugu'  },
  { date: '2026-06-18', ad: 'stage2_mof_int_reel_hindi_dr._raj_parikh_stages_podcast_00102',                                by: 'Aniket',  lang: 'Marathi' },
  { date: '2026-06-18', ad: 'stage2_bof_int_reel_hindi_none_results_testimonial_00015',                                     by: 'Aniket',  lang: 'Kannada' },
  { date: '2026-06-18', ad: 'stage2_bof_int_reel_hindi_none_results_testimonial_00015',                                     by: 'Aniket',  lang: 'Telugu'  },
  { date: '2026-06-18', ad: 'stage2_bof_int_reel_hindi_none_results_testimonial_00015',                                     by: 'Aniket',  lang: 'Marathi' },
  { date: '2026-06-18', ad: 'stage_1_bof_int_reel_hinglish_dr_vikas_mehta_myth_busting_educational_00076',                  by: 'Aniket',  lang: 'Marathi' },
  { date: '2026-06-18', ad: 'stage_1_bof_int_reel_hinglish_dr_vikas_mehta_problem-solution_educational_00072',              by: 'Aniket',  lang: 'Marathi' },
  { date: '2026-06-18', ad: 'stage3_bof_inf_reel_kannada_sam_sameer_genetics_skit_00371',                                   by: 'Pranav',  lang: 'Telugu'  },
]

const insertSeed = dubDb.prepare(`
  INSERT OR IGNORE INTO dub_tracker
    (id, original_ad_name, target_language, status, actioned_by, created_at, updated_at)
  VALUES (?, ?, ?, 'accepted', ?, ?, ?)
`)
for (const r of SEED) {
  const ts = r.date + 'T00:00:00.000Z'
  insertSeed.run(randomUUID(), r.ad, r.lang, r.by, ts, ts)
}

export function getDubConfig() {
  const rows = dubDb.prepare('SELECT key, value FROM config').all()
  return Object.fromEntries(rows.map(r => [r.key, parseFloat(r.value)]))
}

export function logDubAudit({ trackerId, userId, actionType, previousState, newState }) {
  dubDb.prepare(`
    INSERT INTO audit_log (id, tracker_id, user_id, action_type, previous_state, new_state)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(), trackerId, userId, actionType,
    JSON.stringify(previousState ?? null),
    JSON.stringify(newState ?? null),
  )
}
