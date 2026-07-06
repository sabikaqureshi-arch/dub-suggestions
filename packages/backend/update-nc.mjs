import { DatabaseSync } from 'node:sqlite'
const db = new DatabaseSync('./dub_tracker.db')
db.prepare("UPDATE config SET value='5', updated_at=datetime('now') WHERE key='nc_threshold'").run()
const row = db.prepare("SELECT value FROM config WHERE key='nc_threshold'").get()
console.log('nc_threshold is now:', row.value)
db.close()
