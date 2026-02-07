import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/api/ws'
const POLL_INTERVAL = 2000 // fallback polling if WS is unavailable

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

const OFFLINE_MESSAGES = [
  '🚫 VOTE NOT COUNTED!',
  '❌ NO CONNECTION!',
  '💤 SERVER IS SLEEPING...',
  '🔌 PLUG IT BACK IN!',
  '⛔ SMASH IS USELESS RN',
  '😵 NOTHING HAPPENED!',
  '🪫 DEAD SERVER!',
]

const VICTORY_MESSAGES = [
  '🏆 ABSOLUTE DOMINATION!',
  '👑 BOW TO THE CHAMPION!',
  '💀 TOTAL ANNIHILATION!',
  '⚡ FLAWLESS VICTORY!',
  '🔥 THEY NEVER STOOD A CHANCE!',
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

  // Match state — server-authoritative
  const [matchState, setMatchState] = useState('active') // "active" | "victory" | "countdown"
  const [winner, setWinner] = useState(null)
  const [matchesPlayed, setMatchesPlayed] = useState(0)
  const [countdown, setCountdown] = useState(0)
  const [winScore, setWinScore] = useState(100)
  const [victoryMessage, setVictoryMessage] = useState(VICTORY_MESSAGES[0])

  // Apply server state update
  const applyServerState = useCallback((data) => {
    if (typeof data.team1 === 'number' && typeof data.team2 === 'number') {
      setScores({ team1: data.team1, team2: data.team2 })
      setIsOnline(true)
      setError(null)
      pendingUpdatesRef.current = { team1: 0, team2: 0 }
    }
    if (data.matchState) setMatchState(data.matchState)
    if (data.winner !== undefined) setWinner(data.winner)
    if (typeof data.matchesPlayed === 'number') setMatchesPlayed(data.matchesPlayed)
    if (typeof data.countdown === 'number') setCountdown(data.countdown)
    if (typeof data.winScore === 'number') setWinScore(data.winScore)

    // When entering victory, pick a random victory message
    if (data.matchState === 'victory' || data.matchState === 'countdown') {
      setVictoryMessage(VICTORY_MESSAGES[Math.floor(Math.random() * VICTORY_MESSAGES.length)])
    }
  }, [])

  const fetchScores = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/scores`)
      applyServerState(response.data)
    } catch {
      setIsOnline(false)
      setError('Server offline — votes will sync when restored.')
    }
  }, [applyServerState])

  const postVote = async (team) => {
    try {
      const response = await axios.post(`${API_URL}/vote`, { team })
      applyServerState(response.data)
    } catch {
      setIsOnline(false)
      setError('Server offline — reverting vote...')
      setScores(prev => ({ ...prev, [team]: prev[team] - 1 }))
      pendingUpdatesRef.current[team]--
    }
  }

  const handleVote = (team) => {
    // Block voting if match is not active
    if (matchState !== 'active') return

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
    } else {
      // Reset combos when offline
      setComboCount({ team1: 0, team2: 0 })
    }

    // Hype message or offline feedback
    if (isOnline) {
      setHypeMessage(HYPE_MESSAGES[Math.floor(Math.random() * HYPE_MESSAGES.length)])
    } else {
      setHypeMessage(OFFLINE_MESSAGES[Math.floor(Math.random() * OFFLINE_MESSAGES.length)])
    }
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
  const isMatchOver = matchState === 'victory' || matchState === 'countdown'

  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)

  // Connect via WebSocket for real-time updates
  const connectWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return

    try {
      const ws = new WebSocket(WS_URL)

      ws.onopen = () => {
        setIsOnline(true)
        setError(null)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          applyServerState(data)
        } catch { /* ignore malformed messages */ }
      }

      ws.onclose = () => {
        wsRef.current = null
        // Try to reconnect after a delay
        reconnectTimerRef.current = setTimeout(connectWebSocket, POLL_INTERVAL)
      }

      ws.onerror = () => {
        setIsOnline(false)
        setError('Server offline — votes will sync when restored.')
        ws.close()
      }

      wsRef.current = ws
    } catch {
      // WebSocket failed, rely on polling fallback
      setIsOnline(false)
    }
  }, [applyServerState])

  useEffect(() => {
    // Initial REST fetch to get scores immediately
    fetchScores()

    // Connect WebSocket for real-time push
    connectWebSocket()

    // Polling fallback — keeps trying even if WS is down
    const interval = setInterval(fetchScores, POLL_INTERVAL)

    return () => {
      clearInterval(interval)
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [fetchScores, connectWebSocket])

  return (
    <div className={`app-wrapper ${shakeScreen ? 'screen-shake' : ''}`}>
      {/* ===== VICTORY OVERLAY ===== */}
      {isMatchOver && (
        <div className="victory-overlay">
          <div className="victory-content">
            <div className="victory-trophy">🏆</div>
            <h2 className={`victory-team ${winner === 'team1' ? 'text-blue-400' : 'text-red-400'}`}>
              TEAM {winner === 'team1' ? 'BLUE' : 'RED'}
            </h2>
            <div className="victory-label">WINS!</div>
            <div className="victory-hype">{victoryMessage}</div>
            <div className="victory-score">
              <span className="text-blue-400">{scores.team1}</span>
              <span className="text-white/40 mx-3">—</span>
              <span className="text-red-400">{scores.team2}</span>
            </div>
            {countdown > 0 && (
              <div className="victory-countdown">
                <div className="countdown-label">NEXT MATCH IN</div>
                <div className="countdown-number">{countdown}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Three-column layout */}
      <div className="h-full flex">

        {/* ===== TEAM BLUE COLUMN ===== */}
        <div className={`flex-1 flex flex-col items-center justify-center gap-8 bg-gradient-to-b from-blue-950 via-slate-900 to-slate-950 relative overflow-hidden ${isMatchOver ? 'opacity-30 pointer-events-none' : ''}`}>
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
            disabled={isMatchOver}
            className={`smash-btn smash-btn-blue ${smashing.team1 ? 'smashing' : ''} ${isMatchOver ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className="smash-btn-text">SMASH!</span>
            <div className="smash-ripple" />
          </button>

          {/* Leading indicator */}
          {leader === 'team1' && !isMatchOver && (
            <div className="absolute top-6 left-0 right-0 z-10 flex flex-col items-center leading-badge">
              <span className="text-3xl drop-shadow-[0_0_12px_rgba(250,204,21,0.8)]">👑</span>
              <span className="text-yellow-400 text-xs font-black tracking-[0.25em] uppercase mt-1">LEADING</span>
            </div>
          )}
        </div>

        {/* ===== MIDDLE SEPARATOR — HYPE CASTER ===== */}
        <div className="w-52 md:w-64 flex flex-col items-center justify-between pt-12 pb-6 bg-slate-950 relative border-x border-white/5 overflow-hidden">
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
            <div className={`mt-5 flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase ${
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
              <div className="mt-3 text-red-400/70 text-[10px] font-medium leading-tight px-2">
                {error}
              </div>
            )}
          </div>

          {/* VS Badge + Progress */}
          <div className="relative z-10 flex flex-col items-center gap-5">
            {/* Matches played tally */}
            <div className="text-center">
              <div className="text-white/30 text-[10px] font-bold tracking-[0.2em] uppercase mb-0.5">Matches Played</div>
              <div className="text-lg font-black text-purple-400/80 tabular-nums">
                {matchesPlayed}
              </div>
            </div>

            {/* Total smashes — above progress bar */}
            <div className="text-center">
              <div className="text-white/30 text-[10px] font-bold tracking-[0.2em] uppercase mb-0.5">
                Smashes ({scores.team1 + scores.team2}/{winScore})
              </div>
              <div className="w-40 h-1.5 rounded-full bg-slate-800 overflow-hidden border border-white/5 mt-1">
                <div
                  className="h-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-300 ease-out"
                  style={{ width: `${Math.min(100, (totalVotes / winScore) * 100)}%` }}
                />
              </div>
            </div>

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

            {/* Hype message / offline feedback */}
            <div className={`hype-message ${hypeVisible ? 'hype-visible' : 'hype-hidden'} ${!isOnline ? 'offline-msg' : ''}`}>
              <span className="text-sm md:text-base font-black text-center leading-tight">
                {hypeMessage}
              </span>
            </div>
          </div>

          {/* Credit */}
          <div className="relative z-10 text-center">
            <div className="text-white/20 text-[11px] font-medium tracking-wider">@gauciv</div>
          </div>
        </div>

        {/* ===== TEAM RED COLUMN ===== */}
        <div className={`flex-1 flex flex-col items-center justify-center gap-8 bg-gradient-to-b from-red-950 via-slate-900 to-slate-950 relative overflow-hidden ${isMatchOver ? 'opacity-30 pointer-events-none' : ''}`}>
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
            disabled={isMatchOver}
            className={`smash-btn smash-btn-red ${smashing.team2 ? 'smashing' : ''} ${isMatchOver ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className="smash-btn-text">SMASH!</span>
            <div className="smash-ripple" />
          </button>

          {/* Leading indicator */}
          {leader === 'team2' && !isMatchOver && (
            <div className="absolute top-6 left-0 right-0 z-10 flex flex-col items-center leading-badge">
              <span className="text-3xl drop-shadow-[0_0_12px_rgba(250,204,21,0.8)]">👑</span>
              <span className="text-yellow-400 text-xs font-black tracking-[0.25em] uppercase mt-1">LEADING</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
