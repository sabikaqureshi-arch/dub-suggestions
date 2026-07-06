const BASE = '/api/dub-suggestions'

async function call(path, opts = {}) {
  const res = await fetch(BASE + path, { credentials: 'include', ...opts })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export function getSuggestions(params = {}) {
  const q = new URLSearchParams()
  if (params.target_language) q.set('target_language', params.target_language)
  if (params.ad_type) q.set('ad_type', params.ad_type)
  ;[].concat(params.product || []).forEach(p => q.append('product', p))
  ;[].concat(params.source  || []).forEach(s => q.append('source', s))
  return call(`?${q}`)
}

export const acceptAd   = (ad, lang) => call('/accept',      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ original_ad_name: ad, language: lang }) })
export const rejectAd   = (ad, lang, scope, reason) => call('/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ original_ad_name: ad, language: lang, scope, reason }) })
export const laterAd    = (ad, lang) => call('/later',       { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ original_ad_name: ad, language: lang }) })
export const getAccepted = () => call('/accepted')
export const markDubbed  = (id, dubbed_ad_name) => call('/mark-dubbed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, dubbed_ad_name }) })
export const skipAd      = (id) => call('/skip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
export const getRejected = () => call('/rejected')
export const undoReject  = (id) => call('/undo-reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
