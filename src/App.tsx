import { useEffect, useRef, useState } from 'react'
import './App.css'
import { getChannels, getSections, getThreads, createAbortController } from './shared/api/client'
import { useStore } from './shared/state/store'

function App() {
  const loadInitial = useStore(s => s.loadInitial)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    setStatus('loading')
    const controller = createAbortController()
    abortRef.current = controller
    Promise.all([
      getSections({ signal: controller.signal }),
      getChannels({ signal: controller.signal }),
      getThreads({ signal: controller.signal }),
    ])
      .then(([sections, channels, threads]) => {
        loadInitial({ sections, channels, threads })
        console.log('Sections:', sections.length, 'Channels:', channels.length, 'Threads:', threads.length)
        setStatus('ready')
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        console.error('Failed to load data', err)
        setStatus('error')
      })
    return () => {
      controller.abort()
    }
  }, [loadInitial])

  return (
    <div style={{ padding: 24 }}>
      <h1>Chat Panel Scaffold</h1>
      <p>Status: {status}</p>
      <p>Open console for API results. Next steps: build sidebar and pages.</p>
    </div>
  )
}

export default App

