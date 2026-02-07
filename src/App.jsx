import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
const POLL_INTERVAL = 2000

const HYPE_MESSAGES = [
  '🔥 IT\'S HEATING UP!',
  '⚡ UNSTOPPABLE!',
  '💥 ABSOLUTE CARNAGE!',
  '🚀 TO THE MOON!',
  '😤 NO MERCY!',
  '🏆 WHO WILL WIN?!',
  '👊 FIGHT FIGHT FIGHT!',
  '💀 TOTAL DESTRUCTION!',
  '🌊 TIDAL WAVE!',
  '⭐ LEGENDARY!',
]

function App() {
  const [scores, setScores] = useState({ team1: 0, team2: 0 })
  const [error, setError] = useState(null)
  const [isOnline, setIsOnline] = useState(true)
  const [smashing, setSmashing] = useState({ team1: false, team2: false })
  const [shakeScreen, setShakeScreen] = useState(false)
  const [hypeMessage, setHypeMessage] = useState(HYPE_MESSAGES[0])
  const [hypeVisible, setHypeVisible] = useState(false)
  const [comboCount, setComboCount] = useState({ team1: 0, team2: 0 })
  const pendingUpdatesRef = useRef({ team1: 0, team2: 0 })
  const comboTimerRef = useRef({ team1: null, team2: null })

  const fetchScores = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/scores`)
      setScores(response.data)
      setIsOnline(true)
      setError(null)
      pendingUpdatesRef.current = { team1: 0, team2: 0 }
    } catch {
      setIsOnline(false)
      setError('Server offline — votes will sync when restored.')
    }
  }, [])

  const postVote = async (team) => {
    try {
      const response = await axios.post(`${API_URL}/vote`, { team })
      setScores(response.data)
      setIsOnline(true)
      setError(null)
      pendingUpdatesRef.current[team] = 0
    } catch {
      setIsOnline(false)
      setError('Server offline — reverting vote...')
      setScores(prev => ({ ...prev, [team]: prev[team] - 1 }))
      pendingUpdatesRef.current[team]--
    }
  }

  const handleVote = (team) => {
    // Optimistic update
    setScores(prev => ({ ...prev, [team]: prev[team] + 1 }))
    pendingUpdatesRef.current[team]++

    // Smash animation
    setSmashing(prev => ({ ...prev, [team]: true }))
    setShakeScreen(true)
    setTimeout(() => setSmashing(prev => ({ ...prev, [team]: false })), 400)
    setTimeout(() => setShakeScreen(false), 300)

    // Combo counter
    setComboCount(prev => ({ ...prev, [team]: prev[team] + 1 }))
    if (comboTimerRef.current[team]) clearTimeout(comboTimerRef.current[team])
    comboTimerRef.current[team] = setTimeout(() => {
      setComboCount(prev => ({ ...prev, [team]: 0 }))
    }, 1500)

    // Hype message
    setHypeMessage(HYPE_MESSAGES[Math.floor(Math.random() * HYPE_MESSAGES.length)])
    setHypeVisible(true)
    setTimeout(() => setHypeVisible(false), 1200)

    postVote(team)
  }

  const getLeader = () => {
    if (scores.team1 > scores.team2) return 'team1'
    if (scores.team2 > scores.team1) return 'team2'
    return 'tie'
  }

  const leader = getLeader()
  const totalVotes = scores.team1 + scores.team2
  const team1Pct = totalVotes > 0 ? Math.round((scores.team1 / totalVotes) * 100) : 50
  const team2Pct = totalVotes > 0 ? Math.round((scores.team2 / totalVotes) * 100) : 50

  useEffect(() => {
    fetchScores()
    const interval = setInterval(fetchScores, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchScores])

  return (
    <div className={`app-wrapper ${shakeScreen ? 'screen-shake' : ''}`}>
      {/* Status indicator */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full">
        <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]' : 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.7)]'}`} />
        <span className="text-white/80 text-xs font-medium tracking-wide uppercase">
          {isOnline ? 'Live' : 'Offline'}
        </span>
      </div>

      {/* Error toast */}
      {error && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 bg-red-500/90 backdrop-blur text-white px-5 py-2.5 rounded-xl shadow-2xl text-sm font-medium error-toast">
          ⚠️ {error}
        </div>
      )}

      {/* Three-column layout */}
      <div className="h-full flex">

        {/* ===== TEAM BLUE COLUMN ===== */}
        <div className="flex-1 flex flex-col items-center justify-center gap-8 bg-gradient-to-b from-blue-950 via-slate-900 to-slate-950 relative overflow-hidden">
          {/* Background glow */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_60%,rgba(59,130,246,0.15),transparent_70%)]" />

          {/* Team label */}
          <div className="relative z-10 text-center">
            <div className="text-blue-400/70 text-sm font-bold tracking-[0.3em] uppercase mb-1">Team</div>
            <div className="text-4xl md:text-5xl font-black text-blue-400 drop-shadow-[0_0_20px_rgba(59,130,246,0.5)]">
              BLUE
            </div>
          </div>

          {/* Score display */}
          <div className="relative z-10 text-center">
            <div className={`text-7xl md:text-8xl font-black tabular-nums transition-all duration-150 ${
              smashing.team1 ? 'text-white scale-110' : 'text-blue-100'
            }`}>
              {scores.team1.toLocaleString()}
            </div>
            {comboCount.team1 > 1 && (
              <div className="combo-badge bg-blue-500 text-white">
                {comboCount.team1}x COMBO!
              </div>
            )}
            <div className="text-blue-400/50 text-sm font-medium mt-2">{team1Pct}% of votes</div>
          </div>

          {/* SMASH button */}
          <button
            onClick={() => handleVote('team1')}
            className={`smash-btn smash-btn-blue ${smashing.team1 ? 'smashing' : ''}`}
          >
            <span className="smash-btn-text">SMASH!</span>
            <div className="smash-ripple" />
          </button>

          {/* Leading indicator */}
          {leader === 'team1' && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 text-yellow-400 text-xs font-bold tracking-widest uppercase flex items-center gap-1.5 leading-badge">
              👑 Leading
            </div>
          )}
        </div>

        {/* ===== MIDDLE SEPARATOR — HYPE CASTER ===== */}
        <div className="w-52 md:w-64 flex flex-col items-center justify-between py-8 bg-slate-950 relative border-x border-white/5 overflow-hidden">
          {/* Background pattern */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(168,85,247,0.08),transparent_70%)]" />

          {/* Title */}
          <div className="relative z-10 text-center">
            <h1 className="text-2xl md:text-3xl font-black bg-gradient-to-r from-blue-400 via-purple-400 to-red-400 bg-clip-text text-transparent">
              VOTING
            </h1>
            <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-red-400 via-yellow-400 to-blue-400 bg-clip-text text-transparent -mt-1">
              WAR
            </h1>
          </div>

          {/* VS Badge */}
          <div className="relative z-10 flex flex-col items-center gap-6">
            {/* Progress bar */}
            <div className="w-36 h-3 rounded-full bg-slate-800 overflow-hidden border border-white/10">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${team1Pct}%` }}
              />
            </div>

            <div className="vs-badge">
              <span className="text-2xl font-black text-white">VS</span>
            </div>

            {/* Hype message */}
            <div className={`hype-message ${hypeVisible ? 'hype-visible' : 'hype-hidden'}`}>
              <span className="text-sm md:text-base font-black text-center leading-tight">
                {hypeMessage}
              </span>
            </div>
          </div>

          {/* Total counter */}
          <div className="relative z-10 text-center">
            <div className="text-white/30 text-xs font-bold tracking-[0.2em] uppercase mb-1">Total Smashes</div>
            <div className="text-2xl font-black text-white/60 tabular-nums">
              {totalVotes.toLocaleString()}
            </div>
            <div className="text-white/20 text-[10px] mt-2 tracking-wider">LIVE • 2s SYNC</div>
          </div>
        </div>

        {/* ===== TEAM RED COLUMN ===== */}
        <div className="flex-1 flex flex-col items-center justify-center gap-8 bg-gradient-to-b from-red-950 via-slate-900 to-slate-950 relative overflow-hidden">
          {/* Background glow */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_60%,rgba(239,68,68,0.15),transparent_70%)]" />

          {/* Team label */}
          <div className="relative z-10 text-center">
            <div className="text-red-400/70 text-sm font-bold tracking-[0.3em] uppercase mb-1">Team</div>
            <div className="text-4xl md:text-5xl font-black text-red-400 drop-shadow-[0_0_20px_rgba(239,68,68,0.5)]">
              RED
            </div>
          </div>

          {/* Score display */}
          <div className="relative z-10 text-center">
            <div className={`text-7xl md:text-8xl font-black tabular-nums transition-all duration-150 ${
              smashing.team2 ? 'text-white scale-110' : 'text-red-100'
            }`}>
              {scores.team2.toLocaleString()}
            </div>
            {comboCount.team2 > 1 && (
              <div className="combo-badge bg-red-500 text-white">
                {comboCount.team2}x COMBO!
              </div>
            )}
            <div className="text-red-400/50 text-sm font-medium mt-2">{team2Pct}% of votes</div>
          </div>

          {/* SMASH button */}
          <button
            onClick={() => handleVote('team2')}
            className={`smash-btn smash-btn-red ${smashing.team2 ? 'smashing' : ''}`}
          >
            <span className="smash-btn-text">SMASH!</span>
            <div className="smash-ripple" />
          </button>

          {/* Leading indicator */}
          {leader === 'team2' && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 text-yellow-400 text-xs font-bold tracking-widest uppercase flex items-center gap-1.5 leading-badge">
              👑 Leading
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
