import { Link, NavLink } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useStore } from '../shared/state/store'
import { DndContext, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface SidebarProps {
  loading?: boolean
}

export default function Sidebar({ loading }: SidebarProps) {
  const sections = useStore(s => s.sectionOrder.map(id => s.sections[id]))
  const channelsBySection = useStore(s => s.channelsBySection)
  const channels = useStore(s => s.channels)
  const markChannelRead = useStore(s => s.markChannelRead)
  const startGenerator = useStore(s => s.startGenerator)
  const stopGenerator = useStore(s => s.stopGenerator)
  const toggleSection = useStore(s => s.toggleSection)
  const focusedChannelId = useStore(s => s.focusedChannelId)
  const setFocused = useStore(s => s.setFocused)
  const reorderSection = useStore(s => s.reorderSection)
  const reorderChannelWithinSection = useStore(s => s.reorderChannelWithinSection)

  const [menu, setMenu] = useState<{ x: number; y: number; channelId: string } | null>(null)

  const totalUnread = useMemo(() => Object.values(channels).reduce((acc, c) => acc + (c.unread || 0), 0), [channels])

  const hasChannels = Object.keys(channels).length > 0

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const onContextMenu = (e: React.MouseEvent, channelId: string) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, channelId })
  }

  const closeMenu = () => setMenu(null)

  const copyLink = async (id: string) => {
    try {
      await navigator.clipboard.writeText(`app://channel/${id}`)
      console.log('Link copied')
    } catch (e) {
      console.warn('Copy failed', e)
    }
  }

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!active || !over || active.id === over.id) return
    const a = String(active.id)
    const b = String(over.id)
    // section drag
    if (a.startsWith('section:') && b.startsWith('section:')) {
      const sa = a.slice('section:'.length)
      const sb = b.slice('section:'.length)
      if (sa !== sb) reorderSection(sa, sb)
      return
    }
    // channel drag within section
    if (a.startsWith('channel:') && b.startsWith('channel:')) {
      const ca = a.slice('channel:'.length)
      const cb = b.slice('channel:'.length)
      const saId = channels[ca]?.sectionId
      const sbId = channels[cb]?.sectionId
      if (saId && sbId && saId === sbId && ca !== cb) {
        reorderChannelWithinSection(saId, ca, cb)
      }
      return
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }} onClick={closeMenu}>
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

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
          <SortableContext items={sections.map(s => `section:${s.id}`)} strategy={verticalListSortingStrategy}>
            {sections.map((section) => (
              <SortableSection key={section.id} id={`section:${section.id}`}>
                <button onClick={() => toggleSection(section.id)} style={{ padding: '6px 8px', fontWeight: 600, color: 'var(--muted, #6b7280)', background: 'transparent', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}>
                  {section.collapsed ? '►' : '▼'} {section.title} {section.unread ? <span style={{ marginLeft: 6, fontSize: 12 }}>({section.unread})</span> : null}
                </button>
                {!section.collapsed && (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <SortableContext items={(channelsBySection[section.id] || []).map(id => `channel:${id}`)} strategy={verticalListSortingStrategy}>
                      {(channelsBySection[section.id] || []).map((cid) => {
                        const c = channels[cid]
                        const active = focusedChannelId === cid
                        return (
                          <SortableChannel key={cid} id={`channel:${cid}`}>
                            <button
                              onClick={() => { console.log('channelId', cid); markChannelRead(cid); setFocused({ channelId: cid, threadId: undefined }) }}
                              onContextMenu={(e) => onContextMenu(e, cid)}
                              style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 6, border: active ? '1px solid var(--accent, #2563eb)' : 'none', background: active ? 'rgba(37,99,235,0.08)' : 'transparent', display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}
                              title={c.title}
                            >
                              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', overflow: 'hidden' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: c.unread ? 700 : 500 }}>{c.title}</span>
                                <span style={{ fontSize: 12, color: 'var(--muted, #6b7280)' }}>{iconForNotifications(c.notifications)}</span>
                                {c.muted ? <span aria-label="muted" title="Muted">🔕</span> : null}
                              </span>
                              <Badge value={c.unread} />
                            </button>
                          </SortableChannel>
                        )
                      })}
                    </SortableContext>
                  </div>
                )}
              </SortableSection>
            ))}
          </SortableContext>
        </div>
      </DndContext>

      <footer style={{ padding: 8, borderTop: '1px solid var(--border, #e5e7eb)', display: 'flex', gap: 8 }}>
        <button style={{ flex: 1 }} onClick={startGenerator} disabled={!hasChannels}>START</button>
        <button style={{ flex: 1 }} onClick={stopGenerator}>STOP</button>
      </footer>

      {menu && (
        <div role="menu" style={{ position: 'fixed', top: menu.y, left: menu.x, background: 'var(--bg, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', zIndex: 9999, padding: 6 }} onClick={(e) => e.stopPropagation()}>
          <MenuItem onClick={() => { alert(`Channel: ${menu.channelId}`); closeMenu() }}>Информация о канале</MenuItem>
          <MenuItem onClick={() => { markChannelRead(menu.channelId); closeMenu() }}>Отметить прочитанным</MenuItem>
          <MenuItem onClick={() => { copyLink(menu.channelId); closeMenu() }}>Копировать ссылку</MenuItem>
        </div>
      )}
    </div>
  )
}

function SortableSection({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    marginBottom: 8,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  )
}

function SortableChannel({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  )
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button role="menuitem" onClick={onClick} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer' }}>{children}</button>
  )
}

function Badge({ value }: { value: number }) {
  if (!value) return null
  const text = value > 99 ? '99+' : String(value)
  return (
    <span style={{ background: 'var(--badge-bg, #111827)', color: 'var(--badge-text, #fff)', borderRadius: 999, padding: '0 8px', fontSize: 12, lineHeight: '18px', height: 18, display: 'inline-flex', alignItems: 'center' }}>{text}</span>
  )
}

function iconForNotifications(mode: string | undefined) {
  switch (mode) {
    case 'none':
      return '🔕'
    case 'mentions':
      return '@'
    case 'all':
    default:
      return '🔔'
  }
}