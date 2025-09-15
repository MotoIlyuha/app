import { useEffect, useRef, useState } from 'react'
import './App.css'
import { getChannels, getSections, getThreads, createAbortController } from './shared/api/client'
import { useStore } from './shared/state/store'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import NewPage from './pages/New'
import ThreadsPage from './pages/Threads'
import './shared/ui/tokens.css'

// simple toast
function showToast(message: string) {
  const el = document.createElement('div')
  el.textContent = message
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    background: 'var(--text)',
    color: 'var(--bg)',
    padding: '8px 12px',
    borderRadius: '8px',
    boxShadow: '0 6px 18px rgba(0,0,0,0.2)',
    zIndex: '9999',
    opacity: '0',
    transition: 'opacity 120ms ease-in-out',
    pointerEvents: 'none',
    fontSize: '12px',
  } as CSSStyleDeclaration)
  document.body.appendChild(el)
  requestAnimationFrame(() => { el.style.opacity = '1' })
  setTimeout(() => {
    el.style.opacity = '0'
    setTimeout(() => el.remove(), 200)
  }, 1800)
}
;(window as any).showToast = showToast

function App() {
  const loadInitial = useStore(s => s.loadInitial)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const abortRef = useRef<AbortController | null>(null)
  const navigate = useNavigate()

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
        {/* hotkeys: g n -> /new, g t -> /threads, / -> focus search */}
        <Hotkeys onGoNew={() => navigate('/new')} onGoThreads={() => navigate('/threads')} />
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

function Hotkeys({ onGoNew, onGoThreads }: { onGoNew: () => void; onGoThreads: () => void }) {
  useEffect(() => {
    let gPressed = false
    function onKey(e: KeyboardEvent) {
      if (e.key === 'g') {
        gPressed = true
        setTimeout(() => { gPressed = false }, 600)
        return
      }
      if (gPressed && e.key === 'n') { e.preventDefault(); onGoNew(); gPressed = false; return }
      if (gPressed && e.key === 't') { e.preventDefault(); onGoThreads(); gPressed = false; return }
      if (e.key === '/') {
        const input = document.querySelector('input[placeholder="Поиск по названию/каналу"]') as HTMLInputElement | null
        if (input) { e.preventDefault(); input.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onGoNew, onGoThreads])
  return null
}

