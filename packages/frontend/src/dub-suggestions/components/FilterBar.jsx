import React from 'react'

const LANGUAGES = ['Kannada', 'Telugu', 'Tamil', 'Malayalam', 'Marathi']
const PRODUCTS  = ['Stage 1', 'Stage 2', 'Stage 3']
const AD_TYPES  = ['Reel', 'VO']

export default function FilterBar({ filters, onChange, C }) {
  const toggle = (key, val) => {
    const arr = filters[key] || []
    onChange({ ...filters, [key]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] })
  }

  const lbl = { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: C.subtle, marginBottom: 6 }
  const chip = (active) => ({
    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: active ? `1px solid ${C.accent}` : `1px solid ${C.border}`,
    background: active ? C.accent : C.panel,
    color: active ? C.accentFg : C.subtle,
  })
  const sel = {
    padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
    background: C.panel, color: C.text, fontSize: 13, cursor: 'pointer',
    fontFamily: 'inherit',
  }

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 24, display: 'flex', flexWrap: 'wrap', gap: 20 }}>

      <div>
        <div style={lbl}>Target Language *</div>
        <select style={sel} value={filters.target_language} onChange={e => onChange({ ...filters, target_language: e.target.value })}>
          <option value=''>— select —</option>
          {LANGUAGES.map(l => <option key={l}>{l}</option>)}
        </select>
      </div>

      <div>
        <div style={lbl}>Product</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {PRODUCTS.map(p => (
            <button key={p} style={chip((filters.products || []).includes(p))} onClick={() => toggle('products', p)}>{p}</button>
          ))}
        </div>
      </div>

      <div>
        <div style={lbl}>Ad Type</div>
        <select style={sel} value={filters.ad_type || ''} onChange={e => onChange({ ...filters, ad_type: e.target.value })}>
          <option value=''>All</option>
          {AD_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

    </div>
  )
}
