import { DatabaseSync } from 'node:sqlite'
const db = new DatabaseSync('./dub_tracker.db')
db.prepare("UPDATE config SET value='3',  updated_at=datetime('now') WHERE key='nc_threshold'").run()
db.prepare("UPDATE config SET value='60', updated_at=datetime('now') WHERE key='roas_threshold'").run()
const rows = db.prepare('SELECT key, value FROM config').all()
rows.forEach(r => console.log(r.key.padEnd(20), '=', r.value))
db.close()
