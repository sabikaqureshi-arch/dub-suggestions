import React, { useState } from 'react'
import { acceptAd, laterAd } from '../api.js'

const ALL_LANGS = ['Kannada', 'Telugu', 'Tamil', 'Malayalam', 'Marathi']

export default function SuggestionCard({ ad, targetLanguage, onReject, onRemove, C }) {
  const [accepted,   setAccepted]   = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [bulkLangs,  setBulkLangs]  = useState([])
  const [loading,    setLoading]    = useState(null)
  const [snoozeErr,  setSnoozeErr]  = useState(null)

  const maxSnoozed = ad.snooze_count >= ad.max_snoozes

  async function handleAccept() {
    setLoading('accept')
    try {
      await acceptAd(ad.ad_name, targetLanguage)
      for (const lang of bulkLangs) await acceptAd(ad.ad_name, lang)
      setAccepted(true)
      setConfirming(false)
    } catch (e) { alert(e.message) }
    finally { setLoading(null) }
  }

  async function handleLater() {
    if (maxSnoozed) return
    setLoading('later')
    setSnoozeErr(null)
    try { await laterAd(ad.ad_name, targetLanguage); onRemove(ad.ad_name) }
    catch (e) { setSnoozeErr(e.message) }
    finally { setLoading(null) }
  }

  function toggleBulkLang(lang) {
    setBulkLangs(prev => prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang])
  }

  const chip = (color, bg) => ({
    padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
    background: bg || color + '15', color, border: `1px solid ${color}30`,
  })

  const roasPct = (ad.roas * 100).toFixed(1) + '%'
  const roasColor = ad.roas >= 1 ? C.green : ad.roas >= 0.6 ? '#F59E0B' : C.red

  return (
    <div style={{ background: C.panel, border: `1px solid ${accepted ? C.accent + '60' : C.border}`, borderRadius: 12, padding: '18px 20px' }}>

      {/* Top row: ad name + view asset */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 12, color: C.subtle, wordBreak: 'break-all', marginBottom: 8, lineHeight: 1.5 }}>
            {ad.ad_name}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <span style={chip(C.blue)}>{ad.product}</span>
            <span style={chip('#6366F1')}>{ad.source_language}</span>
            <span style={chip(C.subtle)}>{ad.ad_type}</span>
            <span style={chip(C.subtle)}>{ad.source}</span>
            {ad.already_dubbed_languages.map(l => (
              <span key={l} style={chip(C.green)}>✓ {l}</span>
            ))}
          </div>
        </div>
        {ad.drive_link && (
          <a href={ad.drive_link} target='_blank' rel='noreferrer' style={{
            padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
            color: C.subtle, fontSize: 12, fontWeight: 600, textDecoration: 'none',
            whiteSpace: 'nowrap', background: C.bg,
          }}>
            View Asset ↗
          </a>
        )}
      </div>

      {/* Metrics row */}
      <div style={{ display: 'flex', gap: 28, marginBottom: 16, padding: '12px 16px', background: C.bg, borderRadius: 8 }}>
        {[
          ['ROAS', roasPct, roasColor],
          ['NCs',  ad.nc,   C.text],
          ['Spend','₹' + ad.spend.toLocaleString('en-IN'), C.text],
          ['CAC',  '₹' + ad.cac, C.text],
        ].map(([label, val, color]) => (
          <div key={label}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: C.muted, marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Actions */}
      {accepted ? (
        <div style={{ fontSize: 13, fontWeight: 600, color: C.green }}>
          ✓ Accepted for {[targetLanguage, ...bulkLangs].join(', ')}
        </div>
      ) : confirming ? (
        <div>
          <div style={{ fontSize: 13, color: C.text, fontWeight: 500, marginBottom: 10 }}>
            Accept for <strong>{targetLanguage}</strong>?
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: C.muted, marginBottom: 8 }}>
              Also accept for
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ALL_LANGS.filter(l => l !== targetLanguage && !ad.already_dubbed_languages.includes(l)).map(lang => (
                <label key={lang} style={{
                  display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                  padding: '5px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${bulkLangs.includes(lang) ? C.accent + '80' : C.border}`,
                  background: bulkLangs.includes(lang) ? C.accent + '15' : 'transparent',
                  color: bulkLangs.includes(lang) ? '#B45309' : C.subtle,
                }}>
                  <input type='checkbox' checked={bulkLangs.includes(lang)} onChange={() => toggleBulkLang(lang)}
                    style={{ margin: 0, width: 13, height: 13, accentColor: C.accent }} />
                  {lang}
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleAccept} disabled={!!loading} style={{
              padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: C.accent, color: C.accentFg, fontSize: 13, fontWeight: 700,
              opacity: loading ? 0.6 : 1,
            }}>
              {loading === 'accept' ? '…' : `Confirm${bulkLangs.length ? ` (${1 + bulkLangs.length} langs)` : ''}`}
            </button>
            <button onClick={() => { setConfirming(false); setBulkLangs([]) }} disabled={!!loading} style={{
              padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
              border: `1px solid ${C.border}`, background: 'transparent', color: C.subtle,
            }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setConfirming(true)} disabled={!!loading} style={{
              padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: C.accent, color: C.accentFg, fontSize: 13, fontWeight: 700,
            }}>
              Accept for {targetLanguage}
            </button>
            <button onClick={() => onReject(ad)} disabled={!!loading} style={{
              padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
              border: `1px solid ${C.red}40`, background: C.red + '10', color: C.red,
            }}>
              Reject
            </button>
            <button onClick={handleLater} disabled={!!loading || maxSnoozed} style={{
              padding: '8px 14px', borderRadius: 8, cursor: maxSnoozed ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600,
              border: `1px solid ${C.border}`, background: 'transparent',
              color: maxSnoozed ? C.muted : C.subtle,
              opacity: maxSnoozed ? 0.5 : 1,
            }}>
              {loading === 'later' ? '…' : `Later${ad.snooze_count > 0 ? ` (${ad.snooze_count}/${ad.max_snoozes})` : ''}`}
            </button>
          </div>
          {maxSnoozed && (
            <div style={{ marginTop: 8, fontSize: 12, color: C.red }}>
              Max snoozes reached — accept or reject this ad.
            </div>
          )}
          {snoozeErr && (
            <div style={{ marginTop: 8, fontSize: 12, color: C.red }}>{snoozeErr}</div>
          )}
        </div>
      )}
    </div>
  )
}
