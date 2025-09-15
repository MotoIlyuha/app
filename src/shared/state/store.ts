import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Channel, Id, Section, Thread } from './types';
import type { ChannelDTO, SectionDTO, ThreadDTO } from '../api/types';

const PERSIST_KEY = 'chat_panel_state_v1';

export interface EntitiesState {
  sections: Record<Id, Section>;
  channels: Record<Id, Channel>;
  threads: Record<Id, Thread>;
  // Indices
  sectionOrder: Id[]; // order of sections by position
  channelsBySection: Record<Id, Id[]>; // channel ids sorted by position
  threadsByChannel: Record<Id, Id[]>; // thread ids sorted by lastMessageTs desc
  globalThreadsByTs: Id[]; // for /threads page
}

export interface UiState {
  focusedChannelId?: Id;
  focusedThreadId?: Id;
  generatorTimerId?: number | null;
  monotonicNow?: number;
  threadSeq?: number;
}

export interface Actions {
  loadInitial: (data: { sections: SectionDTO[]; channels: ChannelDTO[]; threads: ThreadDTO[] }) => void;
  markChannelRead: (id: Id) => void;
  markThreadRead: (id: Id) => void;
  applyMessage: (args: { channelId: Id; threadId?: Id; hasMention?: boolean }) => void;
  toggleSection: (id: Id) => void;
  hideChannel: (id: Id, hidden: boolean) => void;
  setNotifications: (scope: 'channel' | 'thread', id: Id, mode: Channel['notifications']) => void;
  setFocused: (payload: { channelId?: Id; threadId?: Id }) => void;
  startGenerator: () => void;
  stopGenerator: () => void;
  reorderSection: (activeId: Id, overId: Id) => void;
  reorderChannelWithinSection: (sectionId: Id, activeId: Id, overId: Id) => void;
}

export type StoreState = EntitiesState & UiState & Actions;

const initial: EntitiesState & UiState = {
  sections: {},
  channels: {},
  threads: {},
  sectionOrder: [],
  channelsBySection: {},
  threadsByChannel: {},
  globalThreadsByTs: [],
  focusedChannelId: undefined,
  focusedThreadId: undefined,
  generatorTimerId: null,
  monotonicNow: Date.now(),
  threadSeq: 1,
};

function insertByPosition(arr: Id[], id: Id, getPos: (id: Id) => number) {
  const pos = getPos(id);
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (getPos(arr[mid]) <= pos) lo = mid + 1; else hi = mid;
  }
  arr.splice(lo, 0, id);
}

function insertByTsDesc(arr: Id[], id: Id, getTs: (id: Id) => number) {
  const ts = getTs(id);
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (getTs(arr[mid]) >= ts) lo = mid + 1; else hi = mid;
  }
  arr.splice(lo, 0, id);
}

function removeFromArray(arr: Id[], id: Id) {
  const i = arr.indexOf(id);
  if (i >= 0) arr.splice(i, 1);
}

function bubbleUnreadToSection(state: EntitiesState, channelId: Id) {
  const ch = state.channels[channelId];
  if (!ch || !ch.sectionId) return;
  const section = state.sections[ch.sectionId];
  if (!section) return;
  const ids = state.channelsBySection[ch.sectionId] || [];
  let sum = 0;
  for (const id of ids) sum += state.channels[id]?.unread || 0;
  section.unread = sum;
}

function persistState(state: StoreState) {
  try {
    const payload = {
      collapsed: Object.fromEntries(Object.values(state.sections).map(s => [s.id, s.collapsed])),
      sectionOrder: state.sectionOrder,
      channelsBySection: state.channelsBySection,
    };
    localStorage.setItem(PERSIST_KEY, JSON.stringify(payload));
  } catch {}
}

function readPersisted(): Partial<{ collapsed: Record<string, boolean>; sectionOrder: Id[]; channelsBySection: Record<Id, Id[]>; }> {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch { return {} }
}

export const useStore = create<StoreState>()(devtools((set, get) => ({
  ...initial,
  loadInitial: ({ sections, channels, threads }) => {
    const state: EntitiesState & UiState = {
      ...initial,
    };

    const persisted = readPersisted();

    // Sections
    for (const s of sections) {
      const section: Section = {
        id: s.id,
        title: s.title,
        collapsed: !!persisted.collapsed?.[s.id] || false,
        channelIds: [],
        unread: 0,
        position: s.position ?? 0,
      };
      state.sections[section.id] = section;
    }
    const defaultSectionOrder = Object.keys(state.sections).sort((a, b) => state.sections[a].position - state.sections[b].position);
    state.sectionOrder = Array.isArray(persisted.sectionOrder)
      ? persisted.sectionOrder.filter(id => state.sections[id])
      : defaultSectionOrder;

    // Channels
    for (const c of channels) {
      const ch: Channel = {
        id: c.id,
        sectionId: c.sectionId,
        title: c.title,
        unread: c.unreadCount ?? 0,
        lastMessageTs: c.lastMessageTs ?? 0,
        position: c.position ?? 0,
        hidden: false,
        notifications: c.notificationMode ?? 'all',
        muted: c.muted ?? false,
        threadIds: [],
      };
      state.channels[ch.id] = ch;
      if (ch.sectionId) {
        if (!state.channelsBySection[ch.sectionId]) state.channelsBySection[ch.sectionId] = [];
        insertByPosition(state.channelsBySection[ch.sectionId], ch.id, (id) => state.channels[id].position);
        state.sections[ch.sectionId].channelIds = state.channelsBySection[ch.sectionId];
        state.sections[ch.sectionId].unread += ch.unread;
      }
    }

    // Respect persisted channel order per section if present
    if (persisted.channelsBySection) {
      for (const [secId, order] of Object.entries(persisted.channelsBySection)) {
        const filtered = (order as Id[]).filter(id => !!state.channels[id] && state.channels[id].sectionId === secId);
        if (filtered.length) {
          state.channelsBySection[secId] = filtered;
          if (state.sections[secId]) state.sections[secId].channelIds = filtered;
        }
      }
    }

    // Threads
    for (const t of threads) {
      const th: Thread = {
        id: t.id,
        channelId: t.channelId,
        title: t.title,
        unread: t.unreadCount ?? 0,
        lastMessageTs: t.lastMessageTs ?? 0,
        hasMention: t.hasMention ?? false,
        notifications: t.notificationMode,
      };
      state.threads[th.id] = th;
      if (!state.threadsByChannel[th.channelId]) state.threadsByChannel[th.channelId] = [];
      insertByTsDesc(state.threadsByChannel[th.channelId], th.id, (id) => state.threads[id].lastMessageTs);
      insertByTsDesc(state.globalThreadsByTs, th.id, (id) => state.threads[id].lastMessageTs);
    }

    set(state as StoreState, false, 'loadInitial');
  },

  markChannelRead: (id) => {
    const s = get();
    const ch = s.channels[id];
    if (!ch) return;
    if (!ch.unread) return;
    set((state) => {
      const next = { ...state, channels: { ...state.channels, [id]: { ...state.channels[id], unread: 0 } } } as StoreState;
      bubbleUnreadToSection(next, id);
      return next;
    }, false, 'markChannelRead');
  },

  markThreadRead: (id) => {
    const s = get();
    const th = s.threads[id];
    if (!th || !th.unread) return;
    const chId = th.channelId;
    const diff = th.unread;
    set((state) => {
      const next = { ...state } as StoreState;
      next.threads = { ...next.threads, [id]: { ...next.threads[id], unread: 0 } };
      const channel = next.channels[chId];
      if (channel) {
        const chUnread = Math.max(0, (channel.unread || 0) - diff);
        next.channels = { ...next.channels, [chId]: { ...channel, unread: chUnread } };
        bubbleUnreadToSection(next, chId);
      }
      return next;
    }, false, 'markThreadRead');
  },

  applyMessage: ({ channelId, threadId, hasMention }) => {
    set((state) => {
      const next = { ...state } as StoreState;
      const now = (next.monotonicNow || Date.now()) + 1;
      next.monotonicNow = now;
      if (!threadId) {
        const ch = next.channels[channelId];
        if (!ch) return next;
        const updated = { ...ch, unread: (ch.unread || 0) + 1, lastMessageTs: now };
        next.channels = { ...next.channels, [channelId]: updated };
        bubbleUnreadToSection(next, channelId);
      } else {
        const th = next.threads[threadId];
        if (th) {
          const updatedTh = { ...th, unread: (th.unread || 0) + 1, lastMessageTs: now, hasMention: hasMention || th.hasMention };
          next.threads = { ...next.threads, [threadId]: updatedTh };
        } else {
          const seq = (next.threadSeq || 1) + 1;
          next.threadSeq = seq;
          const newThread: Thread = { id: threadId, channelId, title: `Thread #${seq}`, unread: 1, lastMessageTs: now, hasMention };
          next.threads = { ...next.threads, [threadId]: newThread };
        }
        if (!next.threadsByChannel[channelId]) next.threadsByChannel[channelId] = [];
        removeFromArray(next.threadsByChannel[channelId], threadId!);
        insertByTsDesc(next.threadsByChannel[channelId], threadId!, (id) => next.threads[id].lastMessageTs);
        removeFromArray(next.globalThreadsByTs, threadId!);
        insertByTsDesc(next.globalThreadsByTs, threadId!, (id) => next.threads[id].lastMessageTs);
        const ch = next.channels[channelId];
        if (ch) {
          const updatedCh = { ...ch, lastMessageTs: now };
          next.channels = { ...next.channels, [channelId]: updatedCh };
        }
      }
      return next;
    }, false, 'applyMessage');
  },

  toggleSection: (id) => {
    set((state) => {
      const next = {
        ...state,
        sections: {
          ...state.sections,
          [id]: { ...state.sections[id], collapsed: !state.sections[id].collapsed },
        },
      } as StoreState;
      persistState(next);
      return next;
    }, false, 'toggleSection');
  },

  hideChannel: (id, hidden) => {
    set((state) => ({
      ...state,
      channels: { ...state.channels, [id]: { ...state.channels[id], hidden } },
    }), false, 'hideChannel');
  },

  setNotifications: (scope, id, mode) => {
    set((state) => {
      const next = { ...state } as StoreState;
      if (scope === 'channel') {
        next.channels = { ...next.channels, [id]: { ...next.channels[id], notifications: mode } };
      } else {
        next.threads = { ...next.threads, [id]: { ...next.threads[id], notifications: mode } } as any;
      }
      return next;
    }, false, 'setNotifications');
  },

  setFocused: ({ channelId, threadId }) => {
    set((state) => ({ ...state, focusedChannelId: channelId, focusedThreadId: threadId }), false, 'setFocused');
  },

  startGenerator: () => {
    const s = get();
    if (s.generatorTimerId) return;
    const pickChannels = () => {
      const all = Object.values(get().channels).filter(c => !c.hidden);
      const shuffled = [...all].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, Math.min(5, shuffled.length)).map(c => c.id);
    };

    const timer = window.setInterval(() => {
      const chosen = pickChannels();
      if (chosen.length === 0) return;
      for (let i = 0; i < 10; i++) {
        const channelId = chosen[i % chosen.length];
        const isThread = Math.random() < 0.30;
        if (!isThread) {
          get().applyMessage({ channelId });
        } else {
          const byChan = get().threadsByChannel[channelId] || [];
          let tId: Id | undefined = byChan.length ? byChan[Math.floor(Math.random() * byChan.length)] : undefined;
          if (!tId) {
            const seq = (get().threadSeq || 1) + 1;
            tId = `thread_${channelId}_${seq}`;
          }
          get().applyMessage({ channelId, threadId: tId, hasMention: Math.random() < 0.15 });
        }
      }
    }, 10000);

    set({ generatorTimerId: timer }, false, 'startGenerator');
  },

  stopGenerator: () => {
    const s = get();
    if (s.generatorTimerId) {
      window.clearInterval(s.generatorTimerId);
      set({ generatorTimerId: null }, false, 'stopGenerator');
    }
  },

  reorderSection: (activeId, overId) => {
    set((state) => {
      const next = { ...state } as StoreState;
      const order = [...next.sectionOrder];
      const from = order.indexOf(activeId);
      const to = order.indexOf(overId);
      if (from < 0 || to < 0 || from === to) return next;
      order.splice(to, 0, ...order.splice(from, 1));
      next.sectionOrder = order;
      // sparse positions with step 1024
      order.forEach((id, idx) => { next.sections[id].position = (idx + 1) * 1024 });
      persistState(next);
      return next;
    }, false, 'reorderSection');
  },

  reorderChannelWithinSection: (sectionId, activeId, overId) => {
    set((state) => {
      const next = { ...state } as StoreState;
      const arr = [...(next.channelsBySection[sectionId] || [])];
      const from = arr.indexOf(activeId);
      const to = arr.indexOf(overId);
      if (from < 0 || to < 0 || from === to) return next;
      arr.splice(to, 0, ...arr.splice(from, 1));
      next.channelsBySection[sectionId] = arr;
      next.sections[sectionId].channelIds = arr;
      // sparse positions with step 1024
      arr.forEach((id, idx) => { next.channels[id].position = (idx + 1) * 1024 });
      persistState(next);
      return next;
    }, false, 'reorderChannelWithinSection');
  },
})));


