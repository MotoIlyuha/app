import { useMemo, useState } from 'react'
import { useStore } from '../shared/state/store'

export default function ThreadsPage() {
  const threads = useStore(s => s.threads)
  const channels = useStore(s => s.channels)
  const markThreadRead = useStore(s => s.markThreadRead)
  const setFocused = useStore(s => s.setFocused)
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    const all = Object.values(threads).sort((a, b) => (b.lastMessageTs || 0) - (a.lastMessageTs || 0))
    if (!q) return all
    const query = q.toLowerCase()
    return all.filter(t => t.title.toLowerCase().includes(query) || channels[t.channelId]?.title.toLowerCase().includes(query))
  }, [threads, channels, q])

  return (
    <div style={{ padding: 16 }}>
      <h2>Ветки</h2>
      <input
        placeholder="Поиск по названию/каналу"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, margin: '8px 0 12px' }}
      />
      {list.length === 0 ? (
        <p style={{ color: 'var(--muted, #6b7280)' }}>Веток не найдено</p>
      ) : (
        <ul style={{ padding: 0, margin: 0, listStyle: 'none' }}>
          {list.map(t => (
            <li key={t.id}>
              <button onClick={() => { console.log('threadId', t.id); markThreadRead(t.id); setFocused({ channelId: t.channelId, threadId: t.id }) }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 10px', background: 'transparent', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, marginBottom: 8, cursor: 'pointer' }}>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title} {t.hasMention ? <span title="Есть упоминание">@</span> : null}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channels[t.channelId]?.title}</div>
                </div>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{t.unread > 99 ? '99+' : t.unread}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
