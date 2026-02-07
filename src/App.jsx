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

    // Combo counter — only active when server is online
    if (isOnline) {
      setComboCount(prev => ({ ...prev, [team]: prev[team] + 1 }))
      if (comboTimerRef.current[team]) clearTimeout(comboTimerRef.current[team])
      comboTimerRef.current[team] = setTimeout(() => {
        setComboCount(prev => ({ ...prev, [team]: 0 }))
      }, 1500)
    }

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

          {/* Title + Status */}
          <div className="relative z-10 text-center">
            <h1 className="war-title text-3xl md:text-4xl">
              VOTING
            </h1>
            <h1 className="war-title text-4xl md:text-5xl -mt-1">
              WAR
            </h1>
            <div className={`mt-3 flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase ${
              isOnline
                ? 'bg-emerald-500/10 border border-emerald-500/20'
                : 'bg-red-500/10 border border-red-500/20'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                isOnline
                  ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
                  : 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.8)] animate-pulse'
              }`} />
              <span className={isOnline ? 'text-emerald-400' : 'text-red-400'}>
                {isOnline ? 'LIVE' : 'OFFLINE'}
              </span>
            </div>
            {!isOnline && error && (
              <div className="mt-2 text-red-400/70 text-[10px] font-medium leading-tight px-2">
                {error}
              </div>
            )}
          </div>

          {/* VS Badge + Progress */}
          <div className="relative z-10 flex flex-col items-center gap-5">
            {/* Dual progress bar */}
            <div className="w-40 flex flex-col gap-1.5">
              <div className="flex justify-between text-[10px] font-bold tracking-wider">
                <span className="text-blue-400">{team1Pct}%</span>
                <span className="text-red-400">{team2Pct}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden border border-white/5 flex">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500 ease-out"
                  style={{ width: `${team1Pct}%` }}
                />
                <div
                  className="h-full bg-gradient-to-l from-red-600 to-red-400 transition-all duration-500 ease-out"
                  style={{ width: `${team2Pct}%` }}
                />
              </div>
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
            <div className="text-white/20 text-[10px] mt-2 tracking-wider">SYNC • EVERY 2s</div>
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
