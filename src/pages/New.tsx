import { useMemo } from 'react'
import { useStore } from '../shared/state/store'

export default function NewPage() {
  const channels = useStore(s => s.channels)
  const markChannelRead = useStore(s => s.markChannelRead)

  const unreadChannels = useMemo(() => {
    return Object.values(channels)
      .filter(c => c.unread > 0)
      .sort((a, b) => (b.lastMessageTs || 0) - (a.lastMessageTs || 0))
  }, [channels])

  return (
    <div style={{ padding: 16 }}>
      <h2>Новые</h2>
      {unreadChannels.length === 0 ? (
        <p style={{ color: 'var(--muted, #6b7280)' }}>Нет новых сообщений</p>
      ) : (
        <ul style={{ padding: 0, margin: 0, listStyle: 'none' }}>
          {unreadChannels.map(c => (
            <li key={c.id}>
              <button onClick={() => { console.log('channelId', c.id); markChannelRead(c.id) }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 10px', background: 'transparent', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, marginBottom: 8, cursor: 'pointer' }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{c.unread > 99 ? '99+' : c.unread}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
