import React, { useState, useEffect } from 'react'
import { getRejected, undoReject } from '../api.js'

export default function Rejected({ C }) {
  const [rows,       setRows]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [confirming, setConfirming] = useState(null)

  useEffect(() => {
    getRejected().then(d => setRows(d.rejected)).finally(() => setLoading(false))
  }, [])

  async function handleUndo(id) {
    await undoReject(id)
    setRows(prev => prev.filter(r => r.id !== id))
    setConfirming(null)
  }

  if (loading) return <div style={{ color: C.subtle, fontSize: 13, padding: '40px 0' }}>Loading…</div>
  if (!rows.length) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: C.muted, fontSize: 13 }}>
      No rejected ads.
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map(row => (
        <div key={row.id} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: C.subtle, wordBreak: 'break-all', lineHeight: 1.5, marginBottom: 8 }}>
                {row.original_ad_name}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{
                  padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA',
                }}>
                  {row.reject_scope === 'all' ? 'All Languages' : row.target_language}
                </span>
                <span style={{ fontSize: 11, color: C.muted }}>by {row.actioned_by}</span>
                <span style={{ fontSize: 11, color: C.muted }}>{row.updated_at?.slice(0, 10)}</span>
              </div>
              {row.reject_reason && (
                <div style={{ fontSize: 12, color: C.subtle, marginTop: 8, fontStyle: 'italic' }}>
                  "{row.reject_reason}"
                </div>
              )}
            </div>

            <div style={{ flexShrink: 0 }}>
              {row.can_undo ? (
                confirming === row.id ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => handleUndo(row.id)} style={{
                      padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700,
                      background: C.accent, color: C.accentFg, cursor: 'pointer',
                    }}>Confirm</button>
                    <button onClick={() => setConfirming(null)} style={{
                      padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
                      background: 'transparent', color: C.subtle, fontSize: 12, cursor: 'pointer',
                    }}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirming(row.id)} style={{
                    padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
                    background: 'transparent', color: C.subtle, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>Undo</button>
                )
              ) : (
                <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 1 }}>PERMANENT</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
