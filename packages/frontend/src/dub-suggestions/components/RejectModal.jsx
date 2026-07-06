import React, { useState } from 'react'

export default function RejectModal({ ad, targetLanguage, onConfirm, onClose, C }) {
  const [scope,  setScope]  = useState('language')
  const [reason, setReason] = useState('')
  const canConfirm = reason.trim().length > 0

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#00000050', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, width: 460, maxWidth: '90vw', boxShadow: '0 20px 60px #0002' }}>

        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>Reject Ad</div>
        <div style={{ fontFamily: 'monospace', fontSize: 11, color: C.subtle, marginBottom: 20, wordBreak: 'break-all', lineHeight: 1.5 }}>
          {ad.ad_name}
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: C.subtle, marginBottom: 10 }}>Reject scope</div>
          {[
            ['language', `For ${targetLanguage} only`],
            ['all', 'All languages — never dub this ad'],
          ].map(([val, lbl]) => (
            <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: 'pointer' }}>
              <input type='radio' value={val} checked={scope === val} onChange={() => setScope(val)} />
              <span style={{ fontSize: 13, fontWeight: scope === val ? 600 : 400, color: scope === val ? C.text : C.subtle }}>
                {lbl}
              </span>
            </label>
          ))}
          {scope === 'all' && (
            <div style={{ marginTop: 8, padding: '10px 14px', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 8, fontSize: 12, color: '#92400E' }}>
              ⚠️ This permanently hides the ad from suggestions in <strong>all languages</strong>. Only undo is available for 30 days.
            </div>
          )}
        </div>

        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: C.subtle, marginBottom: 8 }}>Reason *</div>
          <textarea
            rows={3}
            placeholder='Why are we skipping this ad?'
            value={reason}
            onChange={e => setReason(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 12px',
              border: `1px solid ${C.border}`, borderRadius: 8,
              fontSize: 13, fontFamily: 'inherit', color: C.text,
              background: '#FAFAFA', resize: 'vertical', outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '9px 18px', borderRadius: 8, border: `1px solid ${C.border}`,
            background: 'transparent', color: C.subtle, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            Cancel
          </button>
          <button onClick={() => onConfirm(scope, reason)} disabled={!canConfirm} style={{
            padding: '9px 18px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700, cursor: canConfirm ? 'pointer' : 'default',
            background: canConfirm ? C.red : C.border,
            color: canConfirm ? '#fff' : C.muted,
          }}>
            Confirm Reject
          </button>
        </div>
      </div>
    </div>
  )
}
