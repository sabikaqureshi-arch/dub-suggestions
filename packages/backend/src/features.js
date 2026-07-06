/**
 * Single source of truth for all toggleable features in MindMatters.
 *
 * To add a new feature:
 *   1. Add an entry here — { key, label }
 *   2. Add requireFeature('your_key') to its route in index.js
 *
 * That's it. The admin panel toggle, the permissions map, and the
 * super_admin bypass all update automatically from this file.
 */

export const FEATURES = [
  { key: 'personas',       label: 'Persona Explorer' },
  { key: 'competitors',    label: 'Competitor Scrapers' },
  { key: 'my_ads',         label: 'My Ads Analysis' },
  { key: 'video_creation', label: 'Video Creation' },
  { key: 'daily_studio',   label: 'Daily Studio' },
  { key: 'creator_search', label: 'Creator Search' },
  { key: 'perf_analysis',  label: 'Perf Analysis' },
  { key: 'retention',      label: 'Retention Dashboard' },
  { key: 'surveys',        label: 'Surveys' },
  { key: 'script_analyser', label: 'Script Analyser' },
  { key: 'dub_suggestions', label: 'Dub Suggestions' },
]

export const FEATURE_KEYS = FEATURES.map(f => f.key)
