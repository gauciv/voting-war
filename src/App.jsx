import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
const POLL_INTERVAL = 2000 // 2 seconds

function App() {
  const [scores, setScores] = useState({ team1: 0, team2: 0 })
  const [error, setError] = useState(null)
  const [isOnline, setIsOnline] = useState(true)
  const [clickAnimation, setClickAnimation] = useState({ team1: false, team2: false })
  const pendingUpdatesRef = useRef({ team1: 0, team2: 0 })

  // Fetch scores from server
  const fetchScores = async () => {
    try {
      const response = await axios.get(`${API_URL}/scores`)
      setScores(response.data)
      setIsOnline(true)
      setError(null)
      // Reset pending updates when we successfully sync
      pendingUpdatesRef.current = { team1: 0, team2: 0 }
    } catch (err) {
      console.error('Failed to fetch scores:', err)
      setIsOnline(false)
      setError('Server is offline. Votes will sync when connection is restored.')
    }
  }

  // Post vote to server
  const postVote = async (team) => {
    try {
      const response = await axios.post(`${API_URL}/vote`, { team })
      setScores(response.data)
      setIsOnline(true)
      setError(null)
      // Clear pending update for this team on success
      pendingUpdatesRef.current[team] = 0
    } catch (err) {
      console.error('Failed to post vote:', err)
      setIsOnline(false)
      setError('Server is offline. Reverting vote...')
      
      // Revert the optimistic update
      setScores(prev => ({
        ...prev,
        [team]: prev[team] - 1
      }))
      
      // Track failed update
      pendingUpdatesRef.current[team]--
    }
  }

  // Handle button click with optimistic update
  const handleVote = (team) => {
    // Optimistic update - increase score immediately
    setScores(prev => ({
      ...prev,
      [team]: prev[team] + 1
    }))

    // Track pending update
    pendingUpdatesRef.current[team]++

    // Trigger animation
    setClickAnimation(prev => ({ ...prev, [team]: true }))
    setTimeout(() => {
      setClickAnimation(prev => ({ ...prev, [team]: false }))
    }, 300)

    // Send to server
    postVote(team)
  }

  // Polling to sync with server
  useEffect(() => {
    // Initial fetch
    fetchScores()

    // Set up polling
    const interval = setInterval(fetchScores, POLL_INTERVAL)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header with status indicator */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></div>
        <span className="text-white text-sm font-medium">
          {isOnline ? 'Online' : 'Offline'}
        </span>
      </div>

      {/* Error message */}
      {error && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-10 animate-bounce">
          {error}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex">
        {/* Team 1 Button */}
        <button
          onClick={() => handleVote('team1')}
          className={`flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-blue-600 to-blue-800 hover:from-blue-500 hover:to-blue-700 transition-all duration-300 border-r-4 border-slate-900 group relative overflow-hidden ${
            clickAnimation.team1 ? 'scale-95' : 'scale-100'
          }`}
        >
          <div className={`absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300 ${
            clickAnimation.team1 ? 'opacity-30' : ''
          }`}></div>
          <div className="relative z-10 flex flex-col items-center">
            <div className="text-8xl md:text-9xl font-black text-white mb-4 transform group-hover:scale-110 transition-transform duration-300">
              SMASH!
            </div>
            <div className="text-white/70 text-2xl font-semibold mb-2">Team Blue</div>
            <div className="text-6xl font-bold text-white">{scores.team1}</div>
          </div>
        </button>

        {/* Middle Scoreboard */}
        <div className="w-64 flex flex-col items-center justify-center bg-slate-950 relative">
          <div className="absolute top-8">
            <h1 className="text-3xl font-black text-white text-center bg-gradient-to-r from-blue-400 via-purple-400 to-red-400 bg-clip-text text-transparent">
              VOTING WAR
            </h1>
          </div>
          
          <div className="flex flex-col items-center justify-center space-y-8">
            <div className="text-center">
              <div className="text-blue-400 text-xl font-semibold mb-2">TEAM BLUE</div>
              <div className="text-6xl font-black text-white tabular-nums">
                {scores.team1}
              </div>
            </div>

            <div className="w-32 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 rounded-full"></div>

            <div className="text-center">
              <div className="text-red-400 text-xl font-semibold mb-2">TEAM RED</div>
              <div className="text-6xl font-black text-white tabular-nums">
                {scores.team2}
              </div>
            </div>
          </div>

          <div className="absolute bottom-8 text-white/50 text-sm text-center px-4">
            <div>Live scoreboard</div>
            <div className="text-xs mt-1">Updates every 2s</div>
          </div>
        </div>

        {/* Team 2 Button */}
        <button
          onClick={() => handleVote('team2')}
          className={`flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 transition-all duration-300 border-l-4 border-slate-900 group relative overflow-hidden ${
            clickAnimation.team2 ? 'scale-95' : 'scale-100'
          }`}
        >
          <div className={`absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300 ${
            clickAnimation.team2 ? 'opacity-30' : ''
          }`}></div>
          <div className="relative z-10 flex flex-col items-center">
            <div className="text-8xl md:text-9xl font-black text-white mb-4 transform group-hover:scale-110 transition-transform duration-300">
              SMASH!
            </div>
            <div className="text-white/70 text-2xl font-semibold mb-2">Team Red</div>
            <div className="text-6xl font-bold text-white">{scores.team2}</div>
          </div>
        </button>
      </div>
    </div>
  )
}

export default App
