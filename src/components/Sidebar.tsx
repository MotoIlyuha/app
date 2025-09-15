import { NavLink } from 'react-router-dom'
import { useMemo } from 'react'
import { useStore } from '../shared/state/store'

interface SidebarProps {
  loading?: boolean
}

export default function Sidebar({ loading }: SidebarProps) {
  const sectionOrder = useStore(s => s.sectionOrder)
  const sectionsMap = useStore(s => s.sections)
  const sections = useMemo(() => sectionOrder.map(id => sectionsMap[id]), [sectionOrder, sectionsMap])
  const channelsBySection = useStore(s => s.channelsBySection)
  const channels = useStore(s => s.channels)
  const markChannelRead = useStore(s => s.markChannelRead)
  const startGenerator = useStore(s => s.startGenerator)
  const stopGenerator = useStore(s => s.stopGenerator)
  const toggleSection = useStore(s => s.toggleSection)
  const focusedChannelId = useStore(s => s.focusedChannelId)
  const setFocused = useStore(s => s.setFocused)

  const totalUnread = useMemo(() => Object.values(channels).reduce((acc, c) => acc + (c.unread || 0), 0), [channels])

  const hasChannels = Object.keys(channels).length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header style={{ padding: '12px 16px', borderBottom: '1px solid var(--border, #e5e7eb)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong style={{ flex: 1 }}>Server</strong>
        {loading ? <span style={{ fontSize: 12, color: 'var(--muted, #6b7280)' }}>Loading…</span> : null}
      </header>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 8 }}>
        <NavLink to="/new" style={({ isActive }) => ({ padding: '8px 10px', borderRadius: 6, background: isActive ? 'var(--hover, #f3f4f6)' : 'transparent', display: 'flex', justifyContent: 'space-between', textDecoration: 'none', color: 'inherit' })}>
          <span>Новые</span>
          <Badge value={totalUnread} />
        </NavLink>
        <NavLink to="/threads" style={({ isActive }) => ({ padding: '8px 10px', borderRadius: 6, background: isActive ? 'var(--hover, #f3f4f6)' : 'transparent', display: 'flex', justifyContent: 'space-between', textDecoration: 'none', color: 'inherit' })}>
          <span>Ветки</span>
        </NavLink>
      </nav>

      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        {sections.map((section) => (
          <div key={section.id} style={{ marginBottom: 8 }}>
            <button onClick={() => toggleSection(section.id)} style={{ padding: '6px 8px', fontWeight: 600, color: 'var(--muted, #6b7280)', background: 'transparent', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}>
              {section.collapsed ? '►' : '▼'} {section.title} {section.unread ? <span style={{ marginLeft: 6, fontSize: 12 }}>({section.unread})</span> : null}
            </button>
            {!section.collapsed && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {(channelsBySection[section.id] || []).map((cid) => {
                  const c = channels[cid]
                  const active = focusedChannelId === cid
                  return (
                    <button key={cid} onClick={() => { console.log('channelId', cid); markChannelRead(cid); setFocused({ channelId: cid, threadId: undefined }) }} style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 6, border: active ? '1px solid var(--accent, #2563eb)' : 'none', background: active ? 'rgba(37,99,235,0.08)' : 'transparent', display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }} title={c.title}>
                      <span style={{ fontWeight: c.unread ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                      <Badge value={c.unread} />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <footer style={{ padding: 8, borderTop: '1px solid var(--border, #e5e7eb)', display: 'flex', gap: 8 }}>
        <button style={{ flex: 1 }} onClick={startGenerator} disabled={!hasChannels}>START</button>
        <button style={{ flex: 1 }} onClick={stopGenerator}>STOP</button>
      </footer>
    </div>
  )
}

function Badge({ value }: { value: number }) {
  if (!value) return null
  const text = value > 99 ? '99+' : String(value)
  return (
    <span style={{ background: 'var(--badge-bg, #111827)', color: 'var(--badge-text, #fff)', borderRadius: 999, padding: '0 8px', fontSize: 12, lineHeight: '18px', height: 18, display: 'inline-flex', alignItems: 'center' }}>{text}</span>
  )
}
