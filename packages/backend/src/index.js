import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import path from 'path'
import { fileURLToPath } from 'url'
import { _ENV } from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isProduction = process.env.NODE_ENV === 'production'

const app = express()

// Security headers — HSTS, X-Frame-Options, no-sniff, etc.
app.use(helmet({
  contentSecurityPolicy: false, // CSP disabled — app loads external scripts (ElevenLabs, etc.)
  crossOriginEmbedderPolicy: false, // needed for iframe embeds (Retention)
}))

// CORS: restrict to app origin in production
const appUrl = _ENV.get('APP_URL')
app.use(cors({
  origin: isProduction ? appUrl : true,
  credentials: true,
}))

app.use(express.json({ limit: '50mb' }))
app.use(cookieParser())

// Rate limiting on auth endpoints — 10 attempts per minute per IP
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
})

// ── Auth routes (public — no middleware) ─────────────────────────────────────
import { googleLogin, googleCallback, getMe, logout } from './auth/google.js'
import { requireAuth, requireFeature, requireSuperAdmin } from './auth/middleware.js'

app.get('/api/auth/google',          authLimiter, googleLogin)
app.get('/api/auth/google/callback', authLimiter, googleCallback)
app.get('/api/auth/me',              requireAuth, getMe)
app.post('/api/auth/logout',         requireAuth, logout)

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// Public endpoint — frontend fetches this to build the admin panel toggles dynamically
import { FEATURES } from './features.js'
app.get('/api/features', (_req, res) => res.json(FEATURES))

// ── Protected API routes ──────────────────────────────────────────────────────
import claudeRoutes from './routes/claude.js'
import geminiRoutes from './routes/gemini.js'
import elevenlabsRoutes from './routes/elevenlabs.js'
import apifyRoutes from './routes/apify.js'
import transcriptRoutes from './routes/transcripts.js'
import uploadRoutes from './routes/uploads.js'
import videoCreationRoutes from './routes/video-creation.js'
import creatorCloningRoutes from './routes/creator-cloning.js'
import dailyStudioRoutes from './routes/daily-studio.js'
import recreateRoutes from './routes/recreate.js'
import scrapersRoutes from './routes/scrapers.js'
import creatorDiscoveryRoutes from './routes/creator-discovery.js'
import creatorSearchRoutes from './routes/creator-search.js'
import perfAnalysisRoutes from './routes/perf-analysis.js'
import dubSuggestionsRoutes from './routes/dub-suggestions.js'
import surveysRoutes from './routes/surveys.js'
import scriptAnalyserRoutes from './routes/script-analyser.js'
import adminRoutes from './admin/routes.js'

app.use('/api/claude',            requireAuth, requireFeature('personas'),       claudeRoutes)
app.use('/api/gemini',            requireAuth, requireFeature('my_ads'),         geminiRoutes)
app.use('/api/elevenlabs',        requireAuth, requireFeature('personas'),       elevenlabsRoutes)
app.use('/api/apify',             requireAuth,                                   apifyRoutes)
app.use('/api/transcripts',       requireAuth,                                   transcriptRoutes)
app.use('/api/uploads',           requireAuth,                                   uploadRoutes)
app.use('/api/video-creation',    requireAuth, requireFeature('video_creation'), videoCreationRoutes)
app.use('/api/creator-cloning',   requireAuth, requireFeature('video_creation'), creatorCloningRoutes)
app.use('/api/daily-studio',      requireAuth, requireFeature('daily_studio'),   dailyStudioRoutes)
app.use('/api/recreate',          requireAuth, requireFeature('video_creation'), recreateRoutes)
app.use('/api/scrapers',          requireAuth, requireFeature('competitors'),    scrapersRoutes)
app.use('/api/creator-discovery', requireAuth, requireFeature('video_creation'), creatorDiscoveryRoutes)
app.use('/api/creator-search',    requireAuth, requireFeature('creator_search'), creatorSearchRoutes)
app.use('/api/perf-analysis',     requireAuth, requireFeature('perf_analysis'), perfAnalysisRoutes)
app.use('/api/dub-suggestions',   requireAuth, requireFeature('dub_suggestions'), dubSuggestionsRoutes)
// Public survey routes (/public/*) bypass auth — must be before the auth-gated mount
app.use('/api/surveys', (req, res, next) => {
  if (req.path.startsWith('/public')) return surveysRoutes(req, res, next)
  next()
})
app.use('/api/surveys',           requireAuth, requireFeature('surveys'),        surveysRoutes)
app.use('/api/script-analyser',   requireAuth, requireFeature('script_analyser'), scriptAnalyserRoutes)
app.use('/api/admin',             requireAuth, requireSuperAdmin,                adminRoutes)

// ── Frontend serving ──────────────────────────────────────────────────────────
if (isProduction) {
  const distPath = path.resolve(__dirname, '../../frontend/dist')
  app.use(express.static(distPath))
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
} else if (!process.env.SKIP_VITE) {
  const { setupVite } = await import('./vite-dev.js')
  await setupVite(app)
}

const PORT = process.env.PORT || 8182
app.listen(PORT, () => {
  console.log(`[MindMatters] http://localhost:${PORT} (${isProduction ? 'production' : 'development'})`)
  scheduleDailyIntelligence()
})

// ── Intelligence cron (every 15 days at 02:00) ───────────────────────────────
async function scheduleDailyIntelligence() {
  const { buildIntelligence, readIntelligenceCache } = await import('./services/script-analyser/build-intelligence.js')
  const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000
  const run = () => buildIntelligence({ log: m => console.log('[intel-cron]', m) })
    .catch(e => console.error('[intel-cron] failed:', e.message))

  // On startup: only rebuild if cache is missing or older than 15 days
  const cache = await readIntelligenceCache().catch(() => null)
  const ageMs = cache?.meta?.generated ? Date.now() - Date.parse(cache.meta.generated) : Infinity
  if (ageMs > FIFTEEN_DAYS_MS) {
    console.log('[intel-cron] cache stale or missing — rebuilding now')
    run()
  } else {
    const daysOld = Math.round(ageMs / 86_400_000)
    console.log(`[intel-cron] cache is ${daysOld}d old — next rebuild in ${15 - daysOld}d`)
  }

  // Schedule recurring run: next 02:00 that is ≥15 days from last build
  function scheduleNext() {
    const lastBuilt = cache?.meta?.generated ? Date.parse(cache.meta.generated) : Date.now() - FIFTEEN_DAYS_MS
    const nextRun = new Date(lastBuilt + FIFTEEN_DAYS_MS)
    nextRun.setHours(2, 0, 0, 0)
    if (nextRun <= Date.now()) nextRun.setDate(nextRun.getDate() + 1)
    const ms = nextRun - Date.now()
    console.log(`[intel-cron] next rebuild at ${nextRun.toISOString()} (in ${Math.round(ms / 86_400_000)}d)`)
    setTimeout(() => { run(); setInterval(run, FIFTEEN_DAYS_MS) }, Math.max(ms, 0))
  }
  scheduleNext()
}
