import { useState, useRef, useEffect } from 'react'
import { buildPersonaPrompt } from '../lib/promptBuilder.js'
import { useVapi } from '../hooks/useVapi.js'
import { useElevenLabs } from '../hooks/useElevenLabs.js'
import ContentReview from './ContentReview.jsx'
import CompetitorTabs from './CompetitorTabs.jsx'
import InternalAdsAnalysis from './InternalAdsAnalysis.jsx'
import VideoCreation from '../competitor-analysis/video-creation/VideoCreation.jsx'
import DailyStudio from '../daily-studio/DailyStudio.jsx'
import CreatorSearch from '../creator-search/CreatorSearch.jsx'
import PerfAnalysis from '../perf-analysis/PerfAnalysis.jsx'
import Retention from '../retention/Retention.jsx'
import Surveys from '../surveys/Surveys.jsx'
import ScriptAnalyser from '../script-analyser/ScriptAnalyser.jsx'
import DubSuggestions from '../dub-suggestions/DubSuggestions.jsx'
// ── Load all persona JSONs from src/personas/ ────────────────────────────────
const personaModules = import.meta.glob('../personas/*.json', { eager: true })
const ALL_PERSONAS = Object.values(personaModules)
  .map(m => m.default ?? m)
  // Only show rich Man Matters personas (have beliefs field)
  .filter(p => p.beliefs)
  .sort((a, b) => a.name.localeCompare(b.name))

// ── DNA section renderer ─────────────────────────────────────────────────────
function DNASection({ title, data, color }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color, textTransform: 'uppercase', marginBottom: 8 }}>
        {title}
      </div>
      {Array.isArray(data) ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.map((item, i) => (
            <div key={i} style={{ fontSize: 13, color: '#374151', background: '#F9FAFB', borderRadius: 6, padding: '6px 10px', borderLeft: `3px solid ${color}` }}>
              {item}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {Object.entries(data).map(([k, v]) => (
            <div key={k} style={{ fontSize: 13, color: '#374151', background: '#F9FAFB', borderRadius: 6, padding: '6px 10px' }}>
              <span style={{ fontWeight: 600, color: '#6B7280', fontSize: 11 }}>
                {k.replace(/([A-Z])/g, ' $1').toUpperCase()}:{' '}
              </span>
              {Array.isArray(v) ? v.join(', ') : String(v)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function ConsumerBrain({ user }) {
  const can = (feature) => user?.role === 'super_admin' || !!user?.permissions?.[feature]
  const [activeView, setActiveView] = useState('personas') // 'personas' | 'competitors' | 'internal' | 'video-creation' | 'daily-studio' | 'creator-search'
  const [selectedPersona, setSelectedPersona] = useState(null)
  const [activeTab, setActiveTab] = useState('dna')
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [uploadedContent, setUploadedContent] = useState(null)
  const [dataFeedText, setDataFeedText] = useState('')
  const [dataFeeds, setDataFeeds] = useState([])
  const [showFeedModal, setShowFeedModal] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const [elCalls, setElCalls]         = useState(0)
  const [elCredits, setElCredits]     = useState('')
  const [elSessionCr, setElSessionCr] = useState(0)
  const [copiedIdx, setCopiedIdx]     = useState(null)
  const [elTranscript, setElTranscript] = useState([])
  const [elCallActive, setElCallActive] = useState(false)

  const chatEndRef      = useRef(null)
  const fileInputRef    = useRef(null)
  const elWidgetRef     = useRef(null)
  const transcriptEndRef = useRef(null)

  const { startVapiCall, stopVapiCall, callStatus, isSpeaking, volumeLevel, transcript: vapiTranscript, isSaving, lastSavedId } = useVapi(selectedPersona)
  const vapiActive = callStatus === 'active'
  const { speak, stop: stopTts } = useElevenLabs(selectedPersona)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Stop TTS when switching personas or tabs
  useEffect(() => { stopTts() }, [selectedPersona?.id])

  // Inject ElevenLabs script + mount widget when tab is active
  useEffect(() => {
    if (activeTab !== 'elevenlabs') return
    if (!document.querySelector('script[data-el-convai]')) {
      const s = document.createElement('script')
      s.src = 'https://elevenlabs.io/convai-widget/index.js'
      s.async = true
      s.setAttribute('data-el-convai', 'true')
      document.head.appendChild(s)
    }
    if (elWidgetRef.current) {
      elWidgetRef.current.innerHTML = ''
      const w = document.createElement('elevenlabs-convai')
      w.setAttribute('agent-id', 'agent_5701kmpha6d3f3qvpcys2k905ve5')
      elWidgetRef.current.appendChild(w)
    }
  }, [activeTab])

  // Listen for ElevenLabs convai events
  useEffect(() => {
    const onMessage = (e) => {
      if (e.detail?.type === 'transcript' && e.detail?.message) {
        const { role, text } = e.detail.message
        const timestamp = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        setElTranscript(prev => [...prev, { role, text, timestamp }])
      }
    }
    const onCallStarted = () => setElCallActive(true)
    const onCallEnded   = () => setElCallActive(false)
    window.addEventListener('elevenlabs-convai:message', onMessage)
    window.addEventListener('elevenlabs-convai:call-started', onCallStarted)
    window.addEventListener('elevenlabs-convai:call-ended', onCallEnded)
    return () => {
      window.removeEventListener('elevenlabs-convai:message', onMessage)
      window.removeEventListener('elevenlabs-convai:call-started', onCallStarted)
      window.removeEventListener('elevenlabs-convai:call-ended', onCallEnded)
    }
  }, [])

  // Auto-scroll transcript to bottom on new message
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [elTranscript])

  const handlePersonaSelect = (p) => {
    stopVapiCall()
    stopTts()
    setSelectedPersona(p)
    setMessages([{
      role: 'assistant',
      content: `Haan bol — main ${p.name} hoon. ${p.tagline.replace(/"/g, '')} Kya chahiye tujhe?`,
    }])
    setActiveTab('chat')
  }

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setUploadedContent({ data: ev.target.result, name: file.name })
    reader.readAsDataURL(file)
  }

  const sendMessage = async (overrideText) => {
    const text = overrideText ?? inputText
    if ((!text.trim() && !uploadedContent) || !selectedPersona || isLoading) return

    const userMsg = {
      role: 'user',
      content: uploadedContent
        ? `${text || 'React to this as you normally would:'}\n\n[Uploaded: ${uploadedContent.name}]`
        : text,
    }

    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInputText('')
    setUploadedContent(null)
    setIsLoading(true)

    try {
      const feedContext = dataFeeds.length > 0
        ? `\n\n## ADDITIONAL CONSUMER DATA LOADED (${dataFeeds.length} feeds):\n${dataFeeds.map(f => f.content).join('\n---\n')}`
        : ''
      const systemPrompt = buildPersonaPrompt(selectedPersona) + feedContext

      const response = await fetch('/api/claude/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system: systemPrompt,
          messages: newMessages.map(({ role, content }) => ({ role, content })),
        }),
      })

      const data = await response.json()
      if (data.error) throw new Error(data.error.message)
      const reply = data.content?.[0]?.text ?? 'Something went wrong.'
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
      if (ttsEnabled) speak(reply)
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
    }
    setIsLoading(false)
  }

  const handleFeedData = () => {
    if (!dataFeedText.trim()) return
    setDataFeeds(prev => [...prev, {
      id: Date.now(),
      content: dataFeedText,
      timestamp: new Date().toLocaleDateString(),
      preview: dataFeedText.substring(0, 60) + '…',
    }])
    setDataFeedText('')
    setShowFeedModal(false)
  }

  const persona = selectedPersona
  const color = persona?.stageColor ?? '#6B7280'

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#F8F7F4', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* ── HEADER ── */}
      <div style={{ background: '#0F0F0F', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, background: '#F59E0B', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🧠</div>
          <div>
            <div style={{ color: '#FFFFFF', fontWeight: 700, fontSize: 16, letterSpacing: -0.5 }}>MindMatters</div>
            <div style={{ color: '#6B7280', fontSize: 11 }}>Man Matters · Built from 578 real consumers</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ background: '#1A1A1A', color: '#10B981', fontSize: 11, padding: '4px 10px', borderRadius: 20, border: '1px solid #064E3B' }}>
            ● {dataFeeds.length} data feeds active
          </div>
          {can('competitors') && (
            <button
              onClick={() => setActiveView(v => v === 'competitors' ? 'personas' : 'competitors')}
              style={{
                background: activeView === 'competitors' ? '#FFFFFF' : '#1A1A1A',
                color: activeView === 'competitors' ? '#0F0F0F' : '#FFFFFF',
                border: '1px solid #374151', borderRadius: 8,
                padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              🔍 Competitors
            </button>
          )}
          {can('my_ads') && (
            <button
              onClick={() => setActiveView(v => v === 'internal' ? 'personas' : 'internal')}
              style={{
                background: activeView === 'internal' ? '#7C3AED' : '#1A1A1A',
                color: '#FFFFFF',
                border: activeView === 'internal' ? '1px solid #7C3AED' : '1px solid #374151',
                borderRadius: 8,
                padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              📊 My Ads
            </button>
          )}
          {can('video_creation') && (
            <button
              onClick={() => setActiveView(v => v === 'video-creation' ? 'personas' : 'video-creation')}
              style={{
                background: activeView === 'video-creation' ? '#10B981' : '#1A1A1A',
                color: '#FFFFFF',
                border: activeView === 'video-creation' ? '1px solid #10B981' : '1px solid #374151',
                borderRadius: 8,
                padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              🎬 Video Creation
            </button>
          )}
          {can('daily_studio') && (
            <button
              onClick={() => setActiveView(v => v === 'daily-studio' ? 'personas' : 'daily-studio')}
              style={{
                background: activeView === 'daily-studio' ? '#3B82F6' : '#1A1A1A',
                color: '#FFFFFF',
                border: activeView === 'daily-studio' ? '1px solid #3B82F6' : '1px solid #374151',
                borderRadius: 8,
                padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              📅 Daily Studio
            </button>
          )}
          {can('creator_search') && (
            <button
              onClick={() => setActiveView(v => v === 'creator-search' ? 'personas' : 'creator-search')}
              style={{
                background: activeView === 'creator-search' ? '#EC4899' : '#1A1A1A',
                color: '#FFFFFF',
                border: activeView === 'creator-search' ? '1px solid #EC4899' : '1px solid #374151',
                borderRadius: 8,
                padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              🔍 Creator Search
            </button>
          )}
          {can('perf_analysis') && (
            <button
              onClick={() => setActiveView(v => v === 'perf-analysis' ? 'personas' : 'perf-analysis')}
              style={{
                background: activeView === 'perf-analysis' ? '#2F6FED' : '#1A1A1A',
                color: '#FFFFFF',
                border: activeView === 'perf-analysis' ? '1px solid #2F6FED' : '1px solid #374151',
                borderRadius: 8,
                padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              📊 PerfAnalysis
            </button>
          )}
          {can('retention') && (
            <button
              onClick={() => setActiveView(v => v === 'retention' ? 'personas' : 'retention')}
              style={{
                background: activeView === 'retention' ? '#7C4A2D' : '#1A1A1A',
                color: '#FFFFFF',
                border: activeView === 'retention' ? '1px solid #7C4A2D' : '1px solid #374151',
                borderRadius: 8,
                padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              🔄 Retention
            </button>
          )}
          {can('surveys') && (
            <button
              onClick={() => setActiveView(v => v === 'surveys' ? 'personas' : 'surveys')}
              style={{
                background: activeView === 'surveys' ? '#0EA5A4' : '#1A1A1A',
                color: '#FFFFFF',
                border: activeView === 'surveys' ? '1px solid #0EA5A4' : '1px solid #374151',
                borderRadius: 8,
                padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              📋 Surveys
            </button>
          )}
          {can('script_analyser') && (
            <button
              onClick={() => setActiveView(v => v === 'script-analyser' ? 'personas' : 'script-analyser')}
              style={{
                background: activeView === 'script-analyser' ? '#F97316' : '#1A1A1A',
                color: '#FFFFFF',
                border: activeView === 'script-analyser' ? '1px solid #F97316' : '1px solid #374151',
                borderRadius: 8,
                padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              ✍️ Scripts
            </button>
          )}
          {can('dub_suggestions') && (
            <button
              onClick={() => setActiveView(v => v === 'dub-suggestions' ? 'personas' : 'dub-suggestions')}
              style={{
                background: activeView === 'dub-suggestions' ? '#7C3AED' : '#1A1A1A',
                color: '#FFFFFF',
                border: activeView === 'dub-suggestions' ? '1px solid #7C3AED' : '1px solid #374151',
                borderRadius: 8,
                padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              🎙 Dub Suggestions
            </button>
          )}
          <button
            onClick={() => setShowFeedModal(true)}
            style={{ background: '#F59E0B', color: '#0F0F0F', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            + Feed Data
          </button>
          {user?.role === 'super_admin' && (
            <button
              onClick={() => window.location.href = '/admin'}
              style={{ background: '#1A1A1A', color: '#F59E0B', border: '1px solid #F59E0B', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              ⚙ Admin
            </button>
          )}
          {user && (
            <button
              onClick={async () => { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); window.location.href = '/' }}
              title={`Signed in as ${user.email}`}
              style={{ background: 'transparent', border: '1px solid #374151', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {user.avatarUrl
                ? <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" style={{ width: 22, height: 22, borderRadius: '50%' }} />
                : <span style={{ fontSize: 18 }}>👤</span>}
              <span style={{ fontSize: 11, color: '#9CA3AF' }}>Sign out</span>
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── COMPETITORS VIEW (full width) ── */}
        {activeView === 'competitors' && (
          <CompetitorTabs />
        )}

        {/* ── INTERNAL ADS VIEW (full width) ── */}
        {activeView === 'internal' && (
          <InternalAdsAnalysis />
        )}

        {/* ── VIDEO CREATION VIEW (full width) ── */}
        {activeView === 'video-creation' && (
          <VideoCreation />
        )}

        {/* ── DAILY STUDIO VIEW (full width) ── */}
        {activeView === 'daily-studio' && (
          <DailyStudio />
        )}

        {/* ── CREATOR SEARCH VIEW (full width) ── */}
        {activeView === 'creator-search' && (
          <CreatorSearch />
        )}

        {/* ── PERF ANALYSIS VIEW (full width) ── */}
        {activeView === 'perf-analysis' && (
          <PerfAnalysis />
        )}

        {/* ── RETENTION VIEW (full width) ── */}
        {activeView === 'retention' && (
          <Retention />
        )}

        {/* ── SURVEYS VIEW (full width) ── */}
        {activeView === 'surveys' && can('surveys') && (
          <Surveys user={user} />
        )}

        {/* ── SCRIPT ANALYSER VIEW (full width) ── */}
        {activeView === 'script-analyser' && can('script_analyser') && (
          <ScriptAnalyser />
        )}

        {/* ── DUB SUGGESTIONS VIEW (full width) ── */}
        {activeView === 'dub-suggestions' && can('dub_suggestions') && (
          <div style={{ flex: 1, overflowY: 'auto', background: '#0F0F0F' }}>
            <DubSuggestions />
          </div>
        )}

        {/* ── PERSONAS VIEW ── */}
        {activeView === 'personas' && <>

        {/* ── LEFT PANEL ── */}
        <div style={{ width: 260, background: '#FFFFFF', borderRight: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #F3F4F6' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: '#9CA3AF', textTransform: 'uppercase' }}>
              {ALL_PERSONAS.length} Consumer Personas
            </div>
          </div>

          {ALL_PERSONAS.map(p => (
            <div
              key={p.id}
              onClick={() => handlePersonaSelect(p)}
              style={{
                padding: '14px 16px', cursor: 'pointer',
                borderBottom: '1px solid #F3F4F6',
                background: selectedPersona?.id === p.id ? p.stageBg : 'transparent',
                borderLeft: selectedPersona?.id === p.id ? `3px solid ${p.stageColor}` : '3px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ width: 36, height: 36, background: p.stageColor, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                  {p.avatar}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>{p.age} · {p.city}</div>
                </div>
              </div>
              <div style={{ fontSize: 11, background: p.stageBg, color: p.stageColor, padding: '2px 8px', borderRadius: 10, display: 'inline-block', fontWeight: 600, marginBottom: 4 }}>
                {p.stage}
              </div>
              <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.4 }}>{p.occupation}</div>
            </div>
          ))}

          {dataFeeds.length > 0 && (
            <div style={{ padding: 16, borderTop: '1px solid #F3F4F6', marginTop: 'auto' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 8 }}>Active Data Feeds</div>
              {dataFeeds.map(f => (
                <div key={f.id} style={{ fontSize: 11, color: '#374151', background: '#F9FAFB', borderRadius: 6, padding: '6px 8px', marginBottom: 4 }}>
                  <span style={{ color: '#10B981' }}>●</span> {f.preview}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── MAIN PANEL ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selectedPersona ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 40 }}>
              <div style={{ fontSize: 40 }}>🧠</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>Select a Consumer to Begin</div>
              <div style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', maxWidth: 400 }}>
                Each persona is built from real Man Matters consumer data — surveys, call verbatims, NPS responses, and behavioral patterns.
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {ALL_PERSONAS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handlePersonaSelect(p)}
                    style={{ background: p.stageColor, color: 'white', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Talk to {p.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Persona Header */}
              <div style={{ background: '#FFFFFF', borderBottom: '1px solid #E5E7EB', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 42, height: 42, background: color, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 14 }}>
                    {persona.avatar}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{persona.name}</div>
                    <div style={{ fontSize: 12, color: '#6B7280' }}>{persona.age} · {persona.occupation} · {persona.city}</div>
                  </div>
                  <div style={{ background: persona.stageBg, color, fontSize: 11, padding: '3px 10px', borderRadius: 12, fontWeight: 600, marginLeft: 8 }}>
                    {persona.stage}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Tab buttons */}
                  {['chat', 'dna', 'data', 'review'].map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      style={{
                        background: activeTab === tab ? color : 'transparent',
                        color: activeTab === tab ? 'white' : '#6B7280',
                        border: `1px solid ${activeTab === tab ? color : '#E5E7EB'}`,
                        borderRadius: 8, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {tab === 'chat' ? '💬 Chat' : tab === 'dna' ? '🧬 DNA' : tab === 'data' ? '📊 Data' : '🎯 Review'}
                    </button>
                  ))}
                  {persona.id === 'avinas' && (
                    <button
                      onClick={() => setActiveTab('elevenlabs')}
                      style={{
                        background: activeTab === 'elevenlabs' ? '#F59E0B' : 'transparent',
                        color: activeTab === 'elevenlabs' ? '#0F0F0F' : '#6B7280',
                        border: `1px solid ${activeTab === 'elevenlabs' ? '#F59E0B' : '#E5E7EB'}`,
                        borderRadius: 8, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      🎙️ ElevenLabs
                    </button>
                  )}
                </div>
              </div>

              {/* ── TAB: DNA ── */}
              {activeTab === 'dna' && (
                <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div style={{ background: '#FFFFFF', borderRadius: 12, padding: 16, border: '1px solid #E5E7EB' }}>
                      <DNASection title="Core Beliefs" data={persona.beliefs} color={color} />
                      <DNASection title="Emotional Landscape" data={persona.emotions} color={color} />
                      <DNASection title="Language & Phrases" data={persona.language.phrases} color={color} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div style={{ background: '#FFFFFF', borderRadius: 12, padding: 16, border: '1px solid #E5E7EB' }}>
                        <DNASection title="Purchase Psychology" data={persona.purchase} color={color} />
                      </div>
                      <div style={{ background: '#FFFFFF', borderRadius: 12, padding: 16, border: '1px solid #E5E7EB' }}>
                        <DNASection title="Content Reactions" data={persona.contentReactions} color={color} />
                      </div>
                      <div style={{ background: '#FFFFFF', borderRadius: 12, padding: 16, border: '1px solid #E5E7EB' }}>
                        <DNASection title="Churn Profile" data={persona.churnProfile} color={color} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB: DATA ── */}
              {activeTab === 'data' && (
                <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                  <div style={{ background: '#FFFFFF', borderRadius: 12, padding: 20, border: '1px solid #E5E7EB', marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Data Source</div>
                    <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>{persona.dataAnchors.source}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Key Statistics This Persona Is Built On</div>
                    {persona.dataAnchors.keyStats.map((stat, i) => (
                      <div key={i} style={{ fontSize: 13, color: '#374151', background: persona.stageBg, borderRadius: 8, padding: '8px 12px', marginBottom: 6, borderLeft: `3px solid ${color}` }}>
                        {stat}
                      </div>
                    ))}
                  </div>
                  <div style={{ background: '#FFFFFF', borderRadius: 12, padding: 20, border: '1px solid #E5E7EB' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: 12 }}>Improve This Persona — Feed New Data</div>
                    <textarea
                      value={dataFeedText}
                      onChange={e => setDataFeedText(e.target.value)}
                      placeholder="Paste survey responses, interview transcripts, NPS comments, or any new consumer data here."
                      style={{ width: '100%', height: 120, border: '1px solid #E5E7EB', borderRadius: 8, padding: 12, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                    />
                    <button
                      onClick={handleFeedData}
                      style={{ marginTop: 10, background: color, color: 'white', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Add to MindMatters
                    </button>
                    {dataFeeds.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Active Feeds ({dataFeeds.length})</div>
                        {dataFeeds.map(f => (
                          <div key={f.id} style={{ fontSize: 12, color: '#374151', background: '#F9FAFB', borderRadius: 6, padding: '8px 12px', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                            <span>{f.preview}</span>
                            <span style={{ color: '#9CA3AF' }}>{f.timestamp}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── TAB: REVIEW ── */}
              {activeTab === 'review' && (
                <ContentReview persona={persona} />
              )}

              {/* ── TAB: ELEVENLABS ── */}
              {activeTab === 'elevenlabs' && (
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: '#0F0F0F' }}>

                  {/* LEFT: Widget + Quick Questions */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF', letterSpacing: -0.5, marginBottom: 4 }}>
                        Talk to Avinas — Live Voice Agent
                      </div>
                      <div style={{ fontSize: 12, color: '#6B7280' }}>Powered by ElevenLabs Conversational AI</div>
                    </div>

                    {/* Widget mount point */}
                    <div ref={elWidgetRef} style={{ minHeight: 80 }} />

                    {/* Live Transcript */}
                    <style>{`@keyframes el-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
                    <div style={{ background: '#1A1A1A', border: '1px solid #2D2D2D', borderRadius: 10, padding: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: elCallActive ? '#10B981' : '#4B5563',
                            boxShadow: elCallActive ? '0 0 6px #10B981' : 'none',
                            animation: elCallActive ? 'el-pulse 1.5s ease-in-out infinite' : 'none',
                            flexShrink: 0,
                          }} />
                          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#9CA3AF', textTransform: 'uppercase' }}>
                            Live Transcript
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => {
                              const txt = elTranscript.map(m => `[${m.timestamp}] ${m.role === 'user' ? 'You' : 'Avinas'}: ${m.text}`).join('\n')
                              navigator.clipboard.writeText(txt)
                            }}
                            style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', background: '#2A2A2A', border: '1px solid #374151', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}
                          >Copy All</button>
                          <button
                            onClick={() => setElTranscript([])}
                            style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', background: '#2A2A2A', border: '1px solid #374151', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}
                          >Clear</button>
                        </div>
                      </div>
                      <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {elTranscript.length === 0 ? (
                          <div style={{ color: '#4B5563', fontStyle: 'italic', fontSize: 13, padding: '6px 0' }}>
                            Transcript will appear here once the call starts...
                          </div>
                        ) : (
                          elTranscript.map((m, i) => (
                            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: m.role === 'user' ? '#F59E0B' : '#10B981', flexShrink: 0 }}>
                                  {m.role === 'user' ? 'You:' : 'Avinas:'}
                                </span>
                                <span style={{ fontSize: 13, color: '#FFFFFF', lineHeight: 1.4 }}>{m.text}</span>
                              </div>
                              <div style={{ fontSize: 11, color: '#4B5563', textAlign: 'right' }}>{m.timestamp}</div>
                            </div>
                          ))
                        )}
                        <div ref={transcriptEndRef} />
                      </div>
                    </div>

                    {/* Quick questions */}
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: '#6B7280', textTransform: 'uppercase', marginBottom: 12 }}>
                        Quick Questions — click to copy
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[
                          'Tell me about the moment you first realised your hair was falling',
                          'Why did you ignore it for so long?',
                          'Walk me through how you found Man Matters',
                          'What would have made you act sooner?',
                          'What would make you stop using the product?',
                        ].map((q, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              navigator.clipboard.writeText(q)
                              setCopiedIdx(i)
                              setTimeout(() => setCopiedIdx(null), 1500)
                            }}
                            style={{
                              background: copiedIdx === i ? '#FDE68A' : '#1C1400',
                              border: `1px solid ${copiedIdx === i ? '#F59E0B' : '#3D2E00'}`,
                              borderRadius: 10, padding: '12px 14px',
                              display: 'flex', alignItems: 'flex-start', gap: 10,
                              cursor: 'pointer', textAlign: 'left', width: '100%',
                              transition: 'all 0.15s',
                            }}
                          >
                            <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>
                              {copiedIdx === i ? '✅' : '📋'}
                            </span>
                            <span style={{ fontSize: 13, color: copiedIdx === i ? '#78350F' : '#FCD34D', fontWeight: 500, lineHeight: 1.5 }}>{q}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* RIGHT: Cost Tracker */}
                  <div style={{ width: 280, borderLeft: '1px solid #1A1A1A', padding: 20, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>

                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#F59E0B', textTransform: 'uppercase', marginBottom: 4 }}>Cost Tracker</div>
                      <div style={{ fontSize: 11, color: '#4B5563' }}>₹500 plan · 30,000 credits</div>
                    </div>

                    {/* Calls counter */}
                    <div style={{ background: '#1A1A1A', borderRadius: 10, padding: '14px 16px', border: '1px solid #2A2A2A' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: '#6B7280', textTransform: 'uppercase', marginBottom: 10 }}>Calls</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button
                          onClick={() => setElCalls(c => Math.max(0, c - 1))}
                          style={{ width: 32, height: 32, background: '#2A2A2A', border: '1px solid #374151', borderRadius: 6, color: '#9CA3AF', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >−</button>
                        <span style={{ fontSize: 30, fontWeight: 800, color: '#FFFFFF', flex: 1, textAlign: 'center' }}>{elCalls}</span>
                        <button
                          onClick={() => setElCalls(c => c + 1)}
                          style={{ width: 32, height: 32, background: '#F59E0B', border: 'none', borderRadius: 6, color: '#0F0F0F', fontSize: 20, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >+</button>
                      </div>
                    </div>

                    {/* Credits input */}
                    <div style={{ background: '#1A1A1A', borderRadius: 10, padding: '14px 16px', border: '1px solid #2A2A2A' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: '#6B7280', textTransform: 'uppercase', marginBottom: 8 }}>Credits This Call</div>
                      <input
                        type="number"
                        value={elCredits}
                        onChange={e => setElCredits(e.target.value)}
                        placeholder="e.g. 420"
                        style={{
                          width: '100%', background: '#0F0F0F', border: '1px solid #374151',
                          borderRadius: 8, padding: '8px 10px', fontSize: 14, color: '#FFFFFF',
                          fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                      {elCredits && Number(elCredits) > 0 && (
                        <div style={{ marginTop: 7, fontSize: 12, color: '#F59E0B', fontWeight: 600 }}>
                          ≈ ₹{(Number(elCredits) * 0.01667).toFixed(2)} for this call
                        </div>
                      )}
                      <button
                        onClick={() => {
                          const cr = Number(elCredits)
                          if (!cr || cr <= 0) return
                          setElSessionCr(s => s + cr)
                          setElCredits('')
                        }}
                        disabled={!elCredits || Number(elCredits) <= 0}
                        style={{
                          marginTop: 10, width: '100%', background: '#F59E0B', color: '#0F0F0F',
                          border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 13,
                          fontWeight: 700, cursor: 'pointer',
                          opacity: (!elCredits || Number(elCredits) <= 0) ? 0.4 : 1,
                        }}
                      >
                        Log Call Credits
                      </button>
                    </div>

                    {/* Session total */}
                    <div style={{ background: '#1A1A1A', borderRadius: 10, padding: '14px 16px', border: '1px solid #2A2A2A' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: '#6B7280', textTransform: 'uppercase', marginBottom: 10 }}>Session Total</div>
                      <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 3 }}>Credits used</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: '#FFFFFF', letterSpacing: -0.5, marginBottom: 10 }}>
                        {elSessionCr.toLocaleString('en-IN')}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0F0F0F', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
                        <span style={{ fontSize: 11, color: '#6B7280' }}>INR cost</span>
                        <span style={{ fontSize: 16, fontWeight: 800, color: '#F59E0B' }}>₹{(elSessionCr * 0.01667).toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#4B5563' }}>
                        <span>Remaining (30K plan)</span>
                        <span style={{ color: 30000 - elSessionCr < 5000 ? '#EF4444' : '#6B7280', fontWeight: 600 }}>
                          {Math.max(0, 30000 - elSessionCr).toLocaleString('en-IN')} cr
                        </span>
                      </div>
                    </div>

                    {/* Reset */}
                    <button
                      onClick={() => { setElCalls(0); setElCredits(''); setElSessionCr(0) }}
                      style={{
                        background: 'transparent', border: '1px solid #374151', borderRadius: 8,
                        padding: '8px 0', fontSize: 12, color: '#6B7280', cursor: 'pointer',
                        width: '100%', fontWeight: 600,
                      }}
                    >
                      ↺ Reset Session
                    </button>
                  </div>
                </div>
              )}

              {/* ── TAB: CHAT ── */}
              {activeTab === 'chat' && (
                <>
                  {/* ── LIVE VOICE CALL SCREEN ── */}
                  {callStatus !== 'idle' && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0F0F0F', overflow: 'hidden' }}>

                      {/* Status bar */}
                      <div style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #1A1A1A' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: callStatus === 'active' ? '#10B981' : '#F59E0B', display: 'inline-block', animation: 'pulse 1s infinite', flexShrink: 0 }} />
                        <span style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 600, flex: 1 }}>
                          {callStatus === 'connecting' ? 'Connecting — allow mic if prompted…' : callStatus === 'ending' ? 'Ending call…' : `Live · ${persona.name}`}
                        </span>
                        <button
                          onClick={stopVapiCall}
                          disabled={callStatus !== 'active'}
                          style={{ background: '#EF4444', color: 'white', border: 'none', borderRadius: 8, padding: '5px 14px', fontSize: 12, fontWeight: 700, cursor: callStatus === 'active' ? 'pointer' : 'not-allowed', opacity: callStatus === 'active' ? 1 : 0.5 }}
                        >
                          ⏹ End Call
                        </button>
                      </div>

                      {/* Avatar + who's speaking label */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 20px 12px', gap: 10 }}>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {/* Ripple when persona is speaking */}
                          {isSpeaking && (
                            <>
                              <div style={{ position: 'absolute', width: 110, height: 110, borderRadius: '50%', border: `2px solid ${color}`, opacity: 0.4, animation: 'ripple 1.4s ease-out infinite' }} />
                              <div style={{ position: 'absolute', width: 88, height: 88, borderRadius: '50%', border: `2px solid ${color}`, opacity: 0.6, animation: 'ripple 1.4s ease-out infinite 0.5s' }} />
                            </>
                          )}
                          <div style={{ width: 66, height: 66, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 22, position: 'relative', zIndex: 1, boxShadow: isSpeaking ? `0 0 0 3px ${color}55` : 'none', transition: 'box-shadow 0.2s' }}>
                            {persona.avatar}
                          </div>
                        </div>

                        {/* Speaking status */}
                        {callStatus === 'active' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {isSpeaking ? (
                              <>
                                <span style={{ fontSize: 12, color: color, fontWeight: 700 }}>{persona.name.split(' ')[0]} is speaking</span>
                                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 14 }}>
                                  {[0,1,2,3].map(i => (
                                    <div key={i} style={{ width: 3, background: color, borderRadius: 2, animation: 'soundbar 0.8s ease-in-out infinite', animationDelay: `${i * 0.15}s`, height: '100%' }} />
                                  ))}
                                </div>
                              </>
                            ) : (
                              <>
                                {/* Mic volume bar */}
                                <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 600 }}>🎙 Your turn — speak now</span>
                                <div style={{ width: 60, height: 4, background: '#1F1F1F', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.round(volumeLevel * 100)}%`, height: '100%', background: '#10B981', borderRadius: 2, transition: 'width 0.1s' }} />
                                </div>
                              </>
                            )}
                          </div>
                        )}
                        {callStatus === 'connecting' && (
                          <div style={{ fontSize: 12, color: '#4B5563', fontStyle: 'italic' }}>Waiting for connection…</div>
                        )}
                      </div>

                      {/* Live transcript */}
                      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {vapiTranscript.length === 0 && callStatus === 'active' && (
                          <div style={{ textAlign: 'center', color: '#374151', fontSize: 12, fontStyle: 'italic', marginTop: 4 }}>
                            Transcript will appear here as you talk…
                          </div>
                        )}
                        {vapiTranscript
                          // For user lines: only show final (suppress noise partials)
                          // For persona lines: show partial too (persona is speaking — it's intentional)
                          .filter(line => line.role === 'assistant' || line.isFinal)
                          .map((line, i) => {
                          const isPersona = line.role === 'assistant'
                          return (
                            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: isPersona ? 'flex-start' : 'flex-end', opacity: line.isFinal ? 1 : 0.6 }}>
                              {isPersona && (
                                <div style={{ width: 26, height: 26, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 9, flexShrink: 0, marginTop: 2 }}>
                                  {persona.avatar}
                                </div>
                              )}
                              <div style={{
                                maxWidth: '75%',
                                background: isPersona ? '#1A1A1A' : '#374151',
                                color: '#F3F4F6',
                                borderRadius: isPersona ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
                                padding: '7px 12px', fontSize: 13, lineHeight: 1.5,
                                fontStyle: !line.isFinal ? 'italic' : 'normal',
                                border: !line.isFinal ? '1px solid #2A2A2A' : 'none',
                              }}>
                                {line.text}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── POST-CALL TRANSCRIPT (after call ends, before new one) ── */}
                  {callStatus === 'idle' && vapiTranscript.length > 0 && (
                    <div style={{ borderBottom: '1px solid #E5E7EB', background: '#F9FAFB', padding: '12px 20px', maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 4 }}>
                        {isSaving ? '💾 Saving call transcript…' : lastSavedId ? '✅ Call transcript saved' : 'Last Call Transcript'}
                      </div>
                      {vapiTranscript.filter(l => l.isFinal).map((line, i) => {
                        const isPersona = line.role === 'assistant'
                        return (
                          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: isPersona ? color : '#6B7280', minWidth: 48, textAlign: 'right', flexShrink: 0, paddingTop: 2 }}>
                              {isPersona ? persona.name.split(' ')[0] : 'You'}
                            </div>
                            <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{line.text}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* ── TEXT CHAT (only when no active call) ── */}
                  {callStatus === 'idle' && (
                    <>
                      {/* Messages */}
                      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {messages.length <= 1 && (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                            {[
                              "React to this PDP copy I'll paste",
                              'What would make you buy a ₹1200/month kit?',
                              'What do you think about our latest ad?',
                              'What would make you quit in month 2?',
                              'Walk me through your hair journey from the start',
                            ].map((q, i) => (
                              <button
                                key={i}
                                onClick={() => sendMessage(q)}
                                style={{ background: '#F3F4F6', color: '#374151', border: '1px solid #E5E7EB', borderRadius: 20, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}
                              >
                                {q}
                              </button>
                            ))}
                          </div>
                        )}

                        {messages.map((msg, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 8 }}>
                            {msg.role === 'assistant' && (
                              <div style={{ width: 32, height: 32, background: color, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 11, flexShrink: 0, marginTop: 2 }}>
                                {persona.avatar}
                              </div>
                            )}
                            <div style={{
                              maxWidth: '72%',
                              background: msg.role === 'user' ? '#0F0F0F' : '#FFFFFF',
                              color: msg.role === 'user' ? '#FFFFFF' : '#111827',
                              borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                              padding: '10px 14px', fontSize: 13, lineHeight: 1.6,
                              border: msg.role === 'assistant' ? '1px solid #E5E7EB' : 'none',
                              whiteSpace: 'pre-wrap',
                            }}>
                              {msg.content}
                            </div>
                          </div>
                        ))}

                        {isLoading && (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <div style={{ width: 32, height: 32, background: color, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 11 }}>
                              {persona.avatar}
                            </div>
                            <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '16px 16px 16px 4px', padding: '10px 16px' }}>
                              <div style={{ display: 'flex', gap: 4 }}>
                                {[0, 1, 2].map(i => (
                                  <div key={i} style={{ width: 6, height: 6, background: color, borderRadius: '50%', animation: 'pulse 1s infinite', animationDelay: `${i * 0.2}s` }} />
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>

                      {/* Voice call CTA */}
                      <div style={{ background: '#0F0F0F', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid #1F2937' }}>
                        <button
                          onClick={startVapiCall}
                          style={{
                            flex: 1, background: color, color: 'white', border: 'none', borderRadius: 10,
                            padding: '11px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          }}
                        >
                          🎙 Call {persona.name.split(' ')[0]} — talk via voice
                        </button>
                      </div>

                      {/* Text input */}
                      {uploadedContent && (
                        <div style={{ padding: '8px 20px', background: '#FEF3C7', borderTop: '1px solid #FDE68A', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 16 }}>📎</span>
                          <span style={{ fontSize: 12, color: '#92400E' }}>{uploadedContent.name} ready to analyse</span>
                          <button onClick={() => setUploadedContent(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#92400E', cursor: 'pointer', fontSize: 16 }}>×</button>
                        </div>
                      )}
                      <div style={{ background: '#FFFFFF', borderTop: '1px solid #E5E7EB', padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                        <input ref={fileInputRef} type="file" accept="image/*,.pdf,.txt" onChange={handleFileUpload} style={{ display: 'none' }} />
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          title="Upload image, PDF or text"
                          style={{ background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}
                        >
                          📎
                        </button>
                        <textarea
                          value={inputText}
                          onChange={e => setInputText(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                          placeholder={`Or type to ${persona.name.split(' ')[0]}…`}
                          style={{ flex: 1, border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', resize: 'none', minHeight: 40, maxHeight: 120, lineHeight: 1.5, outline: 'none' }}
                          rows={1}
                        />
                        <button
                          onClick={() => sendMessage()}
                          disabled={(!inputText.trim() && !uploadedContent) || isLoading}
                          style={{
                            background: color, color: 'white', border: 'none', borderRadius: 8,
                            padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                            opacity: ((!inputText.trim() && !uploadedContent) || isLoading) ? 0.5 : 1,
                          }}
                        >
                          Send
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </>}
      </div>

      {/* ── FEED DATA MODAL ── */}
      {showFeedModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, padding: 24, width: 520, maxWidth: '90vw' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Feed New Consumer Data</div>
            <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
              Paste survey responses, interview transcripts, or NPS comments. All personas will be enriched with this data.
            </div>
            <textarea
              value={dataFeedText}
              onChange={e => setDataFeedText(e.target.value)}
              placeholder="Paste raw data here..."
              style={{ width: '100%', height: 160, border: '1px solid #E5E7EB', borderRadius: 8, padding: 12, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowFeedModal(false)} style={{ background: '#F3F4F6', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button onClick={handleFeedData} style={{ background: '#F59E0B', color: '#0F0F0F', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Add to Brain</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
        @keyframes ripple {
          0%   { transform: scale(1);   opacity: 0.4; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes soundbar {
          0%, 100% { transform: scaleY(0.2); }
          50%       { transform: scaleY(1);   }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 2px; }
      `}</style>
    </div>
  )
}
