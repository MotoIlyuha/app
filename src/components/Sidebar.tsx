import { NavLink } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../shared/state/store'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
  closestCenter,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

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
  const reorderSection = useStore(s => s.reorderSection)
  const reorderChannel = useStore(s => s.reorderChannel)
  const hideChannel = useStore(s => s.hideChannel)
  const setNotifications = useStore(s => s.setNotifications)

  const totalUnread = useMemo(() => Object.values(channels).reduce((acc, c) => acc + (c.unread || 0), 0), [channels])

  const hasChannels = Object.keys(channels).length > 0

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const getSectionIdByChannelId = (cid: string | undefined) => (cid ? (channels[cid]?.sectionId as string | undefined) : undefined)

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const aType = (active.data.current as any)?.type
    const oType = (over.data.current as any)?.type
    if (aType === 'section' && oType === 'section') {
      const dragId = active.id as string
      const overId = over.id as string
      if (dragId !== overId) reorderSection(dragId, overId)
      return
    }
    if (aType === 'channel') {
      const chId = active.id as string
      let toSectionId: string | undefined
      let index = 0
      if (oType === 'channel') {
        const overChId = over.id as string
        toSectionId = getSectionIdByChannelId(overChId)
        const list = toSectionId ? (channelsBySection[toSectionId] || []) : []
        index = Math.max(0, list.indexOf(overChId))
      } else if (oType === 'section-drop') {
        toSectionId = (over.data.current as any)?.sectionId as string
        index = 0
      }
      const fromSectionId = getSectionIdByChannelId(chId)
      if (!toSectionId || !fromSectionId) return
      if (fromSectionId === toSectionId) {
        const list = channelsBySection[toSectionId] || []
        const fromIdx = list.indexOf(chId)
        if (fromIdx === -1) return
        // if moving down past original index, account for removal
        const targetIndex = index > fromIdx ? index : index
        if (fromIdx !== targetIndex) {
          reorderChannel({ id: chId, fromSectionId, toSectionId, index: targetIndex })
        }
      } else {
        reorderChannel({ id: chId, fromSectionId, toSectionId, index })
      }
    }
  }

  // Context menu state
  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number; channelId?: string; submenu?: boolean }>(() => ({ open: false, x: 0, y: 0 }))
  const menuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menu.open) return
      const el = menuRef.current
      if (el && !el.contains(e.target as Node)) setMenu(m => ({ ...m, open: false }))
    }
    function onKey(e: KeyboardEvent) {
      if (!menu.open) return
      if (e.key === 'Escape') setMenu(m => ({ ...m, open: false }))
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu.open])

  // Theme switcher
  const THEME_KEY = 'chat_theme'
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(() => {
    const saved = localStorage.getItem(THEME_KEY) as any
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  })
  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme)
    const root = document.documentElement
    root.removeAttribute('data-theme')
    if (theme === 'light' || theme === 'dark') {
      root.setAttribute('data-theme', theme)
    }
  }, [theme])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <header style={{ padding: '12px 16px', borderBottom: '1px solid var(--border, #e5e7eb)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong style={{ flex: 1 }}>Server</strong>
        <select aria-label="Theme" value={theme} onChange={(e) => setTheme(e.target.value as any)} style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border, #e5e7eb)', background: 'transparent', color: 'inherit' }}>
          <option value="system">system</option>
          <option value="light">light</option>
          <option value="dark">dark</option>
        </select>
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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
          <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
            {sections.map((section) => (
              <SortableSection key={section.id} id={section.id}>
                <button onClick={() => toggleSection(section.id)} style={{ padding: '6px 8px', fontWeight: 600, color: 'var(--muted, #6b7280)', background: 'transparent', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ cursor: 'grab', userSelect: 'none' }} aria-hidden>⋮⋮</span>
                  {section.collapsed ? '►' : '▼'} {section.title} {section.unread ? <span style={{ marginLeft: 6, fontSize: 12 }}>({section.unread})</span> : null}
                </button>
                {!section.collapsed && (
                  <div>
                    <SortableContext items={(channelsBySection[section.id] || [])} strategy={verticalListSortingStrategy}>
                      <SectionDropZone sectionId={section.id} />
                      {(channelsBySection[section.id] || []).map((cid) => {
                        const c = channels[cid]
                        const active = focusedChannelId === cid
                        return (
                          <SortableChannel key={cid} id={cid} sectionId={section.id}>
                            <button
                              onClick={() => { console.log('channelId', cid); markChannelRead(cid); setFocused({ channelId: cid, threadId: undefined }) }}
                              onContextMenu={(e) => { e.preventDefault(); setMenu({ open: true, x: e.clientX, y: e.clientY, channelId: cid }) }}
                              onKeyDown={(e) => {
                                if (e.shiftKey && (e.key === 'F10' || e.key === 'ContextMenu')) {
                                  e.preventDefault()
                                  const rect = (e.target as HTMLElement).getBoundingClientRect()
                                  setMenu({ open: true, x: rect.left + 8, y: rect.bottom + 4, channelId: cid })
                                }
                              }}
                              style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 6, border: active ? '1px solid var(--accent, #2563eb)' : 'none', background: active ? 'rgba(37,99,235,0.08)' : 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, cursor: 'pointer', width: '100%', opacity: c.muted ? 0.7 : 1 }}
                              title={c.title}
                            >
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                <span aria-hidden title="drag" style={{ cursor: 'grab', userSelect: 'none', color: 'var(--muted, #6b7280)' }}>⋮</span>
                                <span style={{ fontWeight: c.unread ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                                {c.notifications === 'none' ? <span title="Уведомления выключены" aria-label="notifications off">🔕</span> : c.notifications === 'mentions' ? <span title="Только упоминания" aria-label="mentions only">🔔@</span> : null}
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

      {menu.open ? (
        <div ref={menuRef} role="menu" aria-label="Меню канала" style={{ position: 'absolute', top: menu.y, left: menu.x, background: 'var(--bg, #fff)', color: 'var(--text, #111827)', border: '1px solid var(--border, #e5e7eb)', boxShadow: '0 4px 12px rgba(0,0,0,0.12)', borderRadius: 8, minWidth: 220, padding: 6, zIndex: 50 }}>
          <MenuItem onSelect={() => { console.log('info channelId', menu.channelId); setMenu(m => ({ ...m, open: false })) }}>Информация о канале</MenuItem>
          <MenuItem onSelect={() => { if (menu.channelId) markChannelRead(menu.channelId); setMenu(m => ({ ...m, open: false })) }}>Отметить прочитанным</MenuItem>
          <MenuItem onSelect={() => { if (menu.channelId) { const url = `app://channel/${menu.channelId}`; navigator.clipboard?.writeText(url).then(() => { (window as any).showToast?.('Ссылка скопирована'); }).catch(() => { (window as any).showToast?.('Не удалось скопировать'); }); } setMenu(m => ({ ...m, open: false })) }}>Копировать ссылку</MenuItem>
          <MenuItem onSelect={() => { if (menu.channelId) hideChannel(menu.channelId, true); setMenu(m => ({ ...m, open: false })) }}>Скрыть канал</MenuItem>
          <div role="none" style={{ height: 8 }} />
          <div role="group" aria-label="Уведомления" style={{ display: 'flex', flexDirection: 'column' }}>
            {(() => {
              const c = menu.channelId ? channels[menu.channelId] : undefined
              const mode = c?.notifications || 'all'
              const setMode = (m: 'all' | 'mentions' | 'none') => { if (menu.channelId) setNotifications('channel', menu.channelId, m) }
              return (
                <>
                  <MenuRadio checked={mode === 'all'} onSelect={() => { setMode('all'); setMenu(m => ({ ...m, open: false })) }}>Все сообщения</MenuRadio>
                  <MenuRadio checked={mode === 'mentions'} onSelect={() => { setMode('mentions'); setMenu(m => ({ ...m, open: false })) }}>Только @упоминания</MenuRadio>
                  <MenuRadio checked={mode === 'none'} onSelect={() => { setMode('none'); setMenu(m => ({ ...m, open: false })) }}>Ничего</MenuRadio>
                </>
              )
            })()}
          </div>
        </div>
      ) : null}

      <footer style={{ padding: 8, borderTop: '1px solid var(--border, #e5e7eb)', display: 'flex', gap: 8 }}>
        <button style={{ flex: 1 }} onClick={startGenerator} disabled={!hasChannels}>START</button>
        <button style={{ flex: 1 }} onClick={stopGenerator}>STOP</button>
      </footer>
    </div>
  )
}

function SectionDropZone({ sectionId }: { sectionId: string }) {
  // Represent empty section drop target
  const id = `section-drop:${sectionId}`
  // useSortable as a fake item to get proper over detection
  const { setNodeRef } = useSortable({ id, data: { type: 'section-drop', sectionId } })
  return <div ref={setNodeRef} style={{ height: 4 }} />
}

function SortableSection({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, data: { type: 'section' } })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    marginBottom: 8,
    background: 'transparent',
  } as React.CSSProperties
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  )
}

function SortableChannel({ id, sectionId, children }: { id: string; sectionId: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, data: { type: 'channel', sectionId } })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    display: 'flex',
  } as React.CSSProperties
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  )
}

function MenuItem({ onSelect, children }: { onSelect: () => void; children: React.ReactNode }) {
  return (
    <button role="menuitem" onClick={onSelect} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer' }} onMouseDown={(e) => e.preventDefault()}>
      {children}
    </button>
  )
}

function MenuRadio({ checked, onSelect, children }: { checked: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <button role="menuitemradio" aria-checked={checked} onClick={onSelect} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer' }} onMouseDown={(e) => e.preventDefault()}>
      <span style={{ marginRight: 8 }}>{checked ? '●' : '○'}</span>
      {children}
    </button>
  )
}

function Badge({ value }: { value: number }) {
  if (!value) return null
  const text = value > 99 ? '99+' : String(value)
  return (
    <span style={{ background: 'var(--badge-bg, #111827)', color: 'var(--badge-text, #fff)', borderRadius: 999, padding: '0 8px', fontSize: 12, lineHeight: '18px', height: 18, display: 'inline-flex', alignItems: 'center' }}>{text}</span>
  )
}
