import React, { useState, useEffect } from 'react'
import { getAccepted, markDubbed, skipAd } from '../api.js'

function daysSince(dateStr) {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export default function Accepted({ C }) {
  const [rows,       setRows]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [inputs,     setInputs]     = useState({})
  const [errors,     setErrors]     = useState({})
  const [editing,    setEditing]    = useState({})
  const [confirming, setConfirming] = useState({})
  const [langFilter, setLangFilter] = useState('All')
  const [statusTab,  setStatusTab]  = useState('pending') // 'pending' | 'dubbed'

  useEffect(() => {
    getAccepted().then(d => setRows(d.accepted)).finally(() => setLoading(false))
  }, [])

  async function handleMarkDubbed(row) {
    const name = (inputs[row.id] || '').trim()
    if (!name) return
    setErrors(e => ({ ...e, [row.id]: null }))
    try {
      await markDubbed(row.id, name)
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, status: 'dubbed', dubbed_ad_name: name, dubbed_perf: undefined } : r))
      setInputs(i => ({ ...i, [row.id]: '' }))
      setEditing(e => ({ ...e, [row.id]: false }))
      setConfirming(c => ({ ...c, [row.id]: false }))
    } catch (e) { setErrors(err => ({ ...err, [row.id]: e.message })) }
  }

  async function handleSkip(row) {
    setErrors(e => ({ ...e, [row.id]: null }))
    try {
      await skipAd(row.id)
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, status: 'dubbed', dubbed_ad_name: 'N/A' } : r))
    } catch (e) { setErrors(err => ({ ...err, [row.id]: e.message })) }
  }

  function startEdit(row) {
    setInputs(i => ({ ...i, [row.id]: row.dubbed_ad_name === 'N/A' ? '' : (row.dubbed_ad_name || '') }))
    setEditing(e => ({ ...e, [row.id]: true }))
  }

  function cancelEdit(row) {
    setInputs(i => ({ ...i, [row.id]: '' }))
    setEditing(e => ({ ...e, [row.id]: false }))
    setErrors(e => ({ ...e, [row.id]: null }))
  }

  const allLangs = ['All', ...Array.from(new Set(rows.map(r => r.target_language))).sort()]

  const visible = rows.filter(r => {
    if (langFilter !== 'All' && r.target_language !== langFilter) return false
    if (statusTab === 'pending' && r.status !== 'accepted') return false
    if (statusTab === 'dubbed'  && r.status !== 'dubbed')  return false
    return true
  })

  const pendingCount = rows.filter(r => r.status === 'accepted').length
  const dubbedCount  = rows.filter(r => r.status === 'dubbed').length

  if (loading) return <div style={{ color: C.subtle, fontSize: 13, padding: '40px 0' }}>Loading…</div>
  if (!rows.length) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: C.muted, fontSize: 13 }}>
      No accepted ads yet.
    </div>
  )

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Status tabs */}
        <div style={{ display: 'flex', background: C.bg, borderRadius: 8, padding: 3, border: `1px solid ${C.border}` }}>
          {[['pending', `Pending (${pendingCount})`], ['dubbed', `Dubbed (${dubbedCount})`]].map(([val, lbl]) => (
            <button key={val} onClick={() => setStatusTab(val)} style={{
              padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
              background: statusTab === val ? C.panel : 'transparent',
              color: statusTab === val ? C.text : C.muted,
              boxShadow: statusTab === val ? '0 1px 3px #0001' : 'none',
            }}>{lbl}</button>
          ))}
        </div>

        {/* Language filter chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {allLangs.map(lang => (
            <button key={lang} onClick={() => setLangFilter(lang)} style={{
              padding: '4px 12px', borderRadius: 20, border: `1px solid ${langFilter === lang ? C.accent + '80' : C.border}`,
              background: langFilter === lang ? C.accent + '15' : 'transparent',
              color: langFilter === lang ? '#B45309' : C.subtle,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>{lang}</button>
          ))}
        </div>
      </div>

      {visible.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted, fontSize: 13 }}>
          No {statusTab === 'pending' ? 'pending' : 'dubbed'} ads{langFilter !== 'All' ? ` for ${langFilter}` : ''}.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visible.map(row => {
          const days = daysSince(row.created_at)
          const isHistorical = row.actioned_by === 'historical_import' || row.actioned_by === 'sheet_import'
          return (
            <div key={row.id} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px' }}>

              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: C.subtle, wordBreak: 'break-all', lineHeight: 1.5, marginBottom: 8 }}>
                    {row.original_ad_name}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{
                      padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                      background: row.status === 'dubbed' ? C.green + '15' : C.accent + '20',
                      color: row.status === 'dubbed' ? C.green : '#B45309',
                      border: `1px solid ${row.status === 'dubbed' ? C.green + '40' : C.accent + '50'}`,
                    }}>
                      {row.status === 'dubbed' ? '✓ Dubbed' : 'Accepted'}
                    </span>
                    <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
                      {row.target_language}
                    </span>
                    <span style={{ fontSize: 11, color: C.muted }}>by {row.actioned_by}</span>
                    {row.status === 'accepted' && days !== null && (
                      <span style={{
                        padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        background: days > 14 ? C.red + '15' : days > 7 ? '#FEF3C7' : C.bg,
                        color: days > 14 ? C.red : days > 7 ? '#92400E' : C.muted,
                        border: `1px solid ${days > 14 ? C.red + '40' : days > 7 ? '#FCD34D' : C.border}`,
                      }}>
                        {days}d waiting
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {row.status === 'dubbed' && !editing[row.id] ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: row.dubbed_perf !== undefined ? 10 : 0 }}>
                    <div style={{
                      flex: 1, fontFamily: 'monospace', fontSize: 11,
                      color: row.dubbed_ad_name === 'N/A' ? C.muted : C.green,
                      padding: '8px 12px',
                      background: row.dubbed_ad_name === 'N/A' ? C.bg : C.green + '10',
                      borderRadius: 6, fontStyle: row.dubbed_ad_name === 'N/A' ? 'italic' : 'normal',
                    }}>
                      {row.dubbed_ad_name === 'N/A' ? 'Skipped — no dubbed name tracked' : `↳ ${row.dubbed_ad_name}`}
                    </div>
                    <button onClick={() => startEdit(row)} style={{
                      padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
                      background: 'transparent', color: C.subtle, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>
                      Edit
                    </button>
                  </div>
                  {row.dubbed_perf && row.dubbed_ad_name !== 'N/A' ? (() => {
                    const p = row.dubbed_perf
                    if (p.spend < 500 || p.nc === 0) return (
                      <div style={{ fontSize: 11, color: C.muted, padding: '6px 0', fontStyle: 'italic' }}>
                        Live — insufficient spend to judge (₹{p.spend.toLocaleString('en-IN')} so far)
                      </div>
                    )
                    const roasPct = p.roas.toFixed(2) + '×'
                    const roasColor = p.roas >= 1 ? C.green : p.roas >= 0.6 ? '#F59E0B' : C.red
                    return (
                      <div style={{ display: 'flex', gap: 24, padding: '10px 14px', background: C.bg, borderRadius: 8, alignItems: 'center' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: C.muted }}>Dubbed Perf</div>
                        {[['ROAS', roasPct, roasColor], ['NCs', p.nc, C.text], ['Spend', '₹' + p.spend.toLocaleString('en-IN'), C.text], ['CAC', '₹' + p.cac, C.text]].map(([label, val, color]) => (
                          <div key={label}>
                            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: C.muted, marginBottom: 2 }}>{label}</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{val}</div>
                          </div>
                        ))}
                      </div>
                    )
                  })() : row.dubbed_perf === null && row.dubbed_ad_name !== 'N/A' ? (
                    <div style={{ fontSize: 11, color: C.muted, padding: '6px 0', fontStyle: 'italic' }}>
                      Not live yet — no performance data
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  {/* Auto-match banner — shown when not editing and no dubbed name yet */}
                  {!editing[row.id] && row.auto_match && row.auto_match.length > 0 && (
                    <div style={{ marginBottom: 10, padding: '10px 14px', background: C.green + '10', border: `1px solid ${C.green}40`, borderRadius: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', color: C.green, marginBottom: 6 }}>
                        Auto-detected from creative tracker
                      </div>
                      {row.auto_match.map(name => (
                        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: row.auto_match.length > 1 ? 6 : 0 }}>
                          <div style={{ flex: 1, fontFamily: 'monospace', fontSize: 11, color: C.text, wordBreak: 'break-all' }}>{name}</div>
                          <button
                            onClick={() => { setInputs(i => ({ ...i, [row.id]: name })); setConfirming(c => ({ ...c, [row.id]: true })) }}
                            style={{ padding: '5px 14px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: C.green, color: '#fff', whiteSpace: 'nowrap' }}>
                            Confirm
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {confirming[row.id] ? (
                    <div style={{ padding: '12px 14px', background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Mark as dubbed?</div>
                      <div style={{ fontFamily: 'monospace', fontSize: 11, color: C.green, wordBreak: 'break-all', marginBottom: 12 }}>
                        {inputs[row.id]}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => handleMarkDubbed(row)} style={{
                          padding: '7px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                          background: C.green, color: '#fff',
                        }}>Confirm</button>
                        <button onClick={() => setConfirming(c => ({ ...c, [row.id]: false }))} style={{
                          padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
                          background: 'transparent', color: C.subtle, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={inputs[row.id] || ''}
                        onChange={e => setInputs(i => ({ ...i, [row.id]: e.target.value }))}
                        placeholder={`Paste dubbed ad name (must contain "${row.target_language.toLowerCase()}")`}
                        style={{
                          flex: 1, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
                          fontSize: 12, fontFamily: 'monospace', color: C.text, background: '#FAFAFA', outline: 'none',
                        }}
                      />
                      <button
                        onClick={() => setConfirming(c => ({ ...c, [row.id]: true }))}
                        disabled={!(inputs[row.id] || '').trim()}
                        style={{
                          padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                          background: (inputs[row.id] || '').trim() ? C.green : C.border,
                          color: (inputs[row.id] || '').trim() ? '#fff' : C.muted,
                        }}>
                        Mark Dubbed
                      </button>
                      {editing[row.id] ? (
                        <button onClick={() => cancelEdit(row)} style={{
                          padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
                          background: 'transparent', color: C.subtle, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}>Cancel</button>
                      ) : (
                        <button onClick={() => handleSkip(row)} style={{
                          padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
                          background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                        }}>Skip</button>
                      )}
                    </div>
                  )}
                  {errors[row.id] && (
                    <div style={{ fontSize: 12, color: C.red, marginTop: 6 }}>{errors[row.id]}</div>
                  )}
                  {isHistorical && !editing[row.id] && (
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 6, fontStyle: 'italic' }}>
                      Historical import — use Skip if dubbed name isn't tracked
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
