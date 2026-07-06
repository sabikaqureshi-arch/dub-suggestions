import React, { useState } from 'react'
import Suggestions from './pages/Suggestions.jsx'
import Accepted    from './pages/Accepted.jsx'
import Rejected    from './pages/Rejected.jsx'

const C = {
  bg: '#F8F7F4', panel: '#FFFFFF', border: '#E5E7EB',
  text: '#111827', subtle: '#6B7280', muted: '#9CA3AF',
  accent: '#F59E0B', accentFg: '#0F0F0F',
  green: '#10B981', red: '#EF4444', blue: '#3B82F6',
}

const TABS = [
  { id: 'suggestions', label: 'Suggestions' },
  { id: 'accepted',    label: 'Accepted'    },
  { id: 'rejected',    label: 'Rejected'    },
]

export default function DubSuggestions() {
  const [tab, setTab] = useState('suggestions')

  return (
    <div style={{ flex: 1, background: C.bg, overflowY: 'auto' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 32px' }}>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: C.muted, marginBottom: 4 }}>
            Man Matters · Dub Ops
          </div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: C.text, letterSpacing: -0.5 }}>
            Dub Suggestions
          </h1>
          <p style={{ color: C.subtle, fontSize: 13, marginTop: 6 }}>
            All dubbable reels · Exc. Inf · Ranked by ROAS · 40-day lookback
          </p>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 28, borderBottom: `1px solid ${C.border}` }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '9px 20px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
              color: tab === t.id ? C.text : C.subtle,
              borderBottom: tab === t.id ? `2px solid ${C.accent}` : '2px solid transparent',
              marginBottom: -1,
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'suggestions' && <Suggestions C={C} />}
        {tab === 'accepted'    && <Accepted    C={C} />}
        {tab === 'rejected'    && <Rejected    C={C} />}
      </div>
    </div>
  )
}
