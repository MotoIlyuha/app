import { useEffect, useRef, useState } from 'react'
import './App.css'
import { getChannels, getSections, getThreads, createAbortController } from './shared/api/client'
import { useStore } from './shared/state/store'
import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import NewPage from './pages/New'
import ThreadsPage from './pages/Threads'

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
    <div style={{ display: 'flex', height: '100vh', width: '100%' }}>
      <aside style={{ width: 320, borderRight: '1px solid var(--border, #e5e7eb)', display: 'flex', flexDirection: 'column', minWidth: 280 }}>
        <Sidebar loading={status === 'loading'} />
      </aside>
      <main style={{ flex: 1, overflow: 'auto' }}>
        {status !== 'error' ? (
          <Routes>
            <Route path="/" element={<Navigate to="/new" replace />} />
            <Route path="/new" element={<NewPage />} />
            <Route path="/threads" element={<ThreadsPage />} />
            <Route path="*" element={<Navigate to="/new" replace />} />
          </Routes>
        ) : (
          <div style={{ padding: 24 }}>
            <h2>Failed to load data</h2>
            <p>Check network and reload the page.</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default App

