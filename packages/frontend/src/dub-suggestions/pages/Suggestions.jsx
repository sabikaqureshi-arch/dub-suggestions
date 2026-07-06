import React, { useState, useEffect, useCallback } from 'react'
import FilterBar     from '../components/FilterBar.jsx'
import SuggestionCard from '../components/SuggestionCard.jsx'
import RejectModal   from '../components/RejectModal.jsx'
import { getSuggestions, rejectAd } from '../api.js'

const DEFAULT_FILTERS = { products: [], target_language: '', ad_type: '', sources: [] }

export default function Suggestions({ C }) {
  const [filters,     setFilters]     = useState(DEFAULT_FILTERS)
  const [suggestions, setSuggestions] = useState([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [rejectingAd, setRejectingAd] = useState(null)

  const fetchSuggestions = useCallback(async (f) => {
    if (!f.target_language) { setSuggestions([]); return }
    setLoading(true); setError(null)
    try {
      const params = {}
      if (f.products.length)  params.product = f.products
      if (f.target_language)  params.target_language = f.target_language
      if (f.ad_type)          params.ad_type = f.ad_type
      if (f.sources.length)   params.source  = f.sources
      const data = await getSuggestions(params)
      setSuggestions(data.suggestions)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchSuggestions(filters) }, [filters, fetchSuggestions])

  async function handleRejectConfirm(scope, reason) {
    await rejectAd(rejectingAd.ad_name, filters.target_language, scope, reason)
    setSuggestions(prev => prev.filter(a => a.ad_name !== rejectingAd.ad_name))
    setRejectingAd(null)
  }

  return (
    <div>
      <FilterBar filters={filters} onChange={setFilters} C={C} />

      {!filters.target_language && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: C.muted, fontSize: 13 }}>
          Select a target language above to load suggestions.
        </div>
      )}

      {filters.target_language && loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: C.subtle, fontSize: 13 }}>
          Loading…
        </div>
      )}

      {filters.target_language && error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '14px 18px', color: '#DC2626', fontSize: 13 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {filters.target_language && !loading && !error && suggestions.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: C.muted, fontSize: 13 }}>
          No suggestions match the current filters and thresholds.
        </div>
      )}

      {!loading && !error && suggestions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: C.subtle, marginBottom: 2 }}>
            {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''} for{' '}
            <strong style={{ color: C.text }}>{filters.target_language}</strong>
          </div>
          {suggestions.map(ad => (
            <SuggestionCard
              key={`${ad.ad_name}|||${filters.target_language}`}
              ad={ad}
              targetLanguage={filters.target_language}
              onReject={setRejectingAd}
              onRemove={name => setSuggestions(prev => prev.filter(a => a.ad_name !== name))}
              C={C}
            />
          ))}
        </div>
      )}

      {rejectingAd && (
        <RejectModal
          ad={rejectingAd}
          targetLanguage={filters.target_language}
          onConfirm={handleRejectConfirm}
          onClose={() => setRejectingAd(null)}
          C={C}
        />
      )}
    </div>
  )
}
