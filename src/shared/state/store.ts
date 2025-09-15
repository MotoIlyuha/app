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
  reorderSection: (dragId: Id, overId: Id) => void;
  reorderChannel: (args: { id: Id; fromSectionId: Id; toSectionId: Id; index: number }) => void;
  startGenerator: () => void;
  stopGenerator: () => void;
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

const SPARSE_STEP = 1024;

function computeSparseBetween(before?: number, after?: number): number {
  const b = typeof before === 'number' ? before : 0;
  if (typeof after !== 'number') return b + SPARSE_STEP * 2; // tail insert safety margin
  const mid = Math.floor((b + after) / 2);
  return mid;
}

function needReindex(before?: number, after?: number, candidate?: number): boolean {
  if (typeof before !== 'number' || typeof after !== 'number') return false;
  if (typeof candidate !== 'number') return true;
  return !(candidate > before && candidate < after);
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

function persistCollapsed(state: StoreState) {
  try {
    const payload = {
      collapsed: Object.fromEntries(Object.values(state.sections).map(s => [s.id, s.collapsed])),
    };
    localStorage.setItem(PERSIST_KEY, JSON.stringify(payload));
  } catch {}
}

function readPersisted() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return {} as any;
    return JSON.parse(raw);
  } catch { return {} as any }
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
    state.sectionOrder = Object.keys(state.sections).sort((a, b) => state.sections[a].position - state.sections[b].position);

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
      persistCollapsed(next);
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

  reorderSection: (dragId, overId) => {
    set((state) => {
      if (!state.sections[dragId] || !state.sections[overId]) return state as StoreState;
      const next = { ...state } as StoreState;
      const order = [...next.sectionOrder];
      const fromIdx = order.indexOf(dragId);
      const toIdx = order.indexOf(overId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return next;
      order.splice(fromIdx, 1);
      order.splice(toIdx, 0, dragId);

      // compute new position for dragId
      const beforeId = order[toIdx - 1];
      const afterId = order[toIdx + 1];
      const beforePos = beforeId ? next.sections[beforeId]?.position : undefined;
      const afterPos = afterId ? next.sections[afterId]?.position : undefined;
      let pos = computeSparseBetween(beforePos, afterPos);

      if (needReindex(beforePos, afterPos, pos)) {
        // reindex all sections with sparse grid
        for (let i = 0; i < order.length; i++) {
          const id = order[i];
          const newPos = (i + 1) * SPARSE_STEP;
          next.sections[id] = { ...next.sections[id], position: newPos } as Section;
        }
      } else {
        next.sections[dragId] = { ...next.sections[dragId], position: pos } as Section;
      }
      next.sectionOrder = order;
      return next;
    }, false, 'reorderSection');
  },

  reorderChannel: ({ id, fromSectionId, toSectionId, index }) => {
    set((state) => {
      const channel = state.channels[id];
      if (!channel) return state as StoreState;

      const next = { ...state } as StoreState;
      // ensure arrays exist
      if (!next.channelsBySection[fromSectionId]) next.channelsBySection[fromSectionId] = [];
      if (!next.channelsBySection[toSectionId]) next.channelsBySection[toSectionId] = [];

      // remove from source
      const src = [...next.channelsBySection[fromSectionId]];
      removeFromArray(src, id);
      next.channelsBySection[fromSectionId] = src;

      // insert into target at index
      const dst = [...next.channelsBySection[toSectionId]];
      const clampedIndex = Math.max(0, Math.min(index, dst.length));
      dst.splice(clampedIndex, 0, id);

      // compute new sparse position
      const beforeId = dst[clampedIndex - 1];
      const afterId = dst[clampedIndex + 1];
      const beforePos = beforeId ? next.channels[beforeId]?.position : undefined;
      const afterPos = afterId ? next.channels[afterId]?.position : undefined;
      let pos = computeSparseBetween(beforePos, afterPos);

      // if not enough space, reindex only target section then recompute
      if (needReindex(beforePos, afterPos, pos)) {
        for (let i = 0; i < dst.length; i++) {
          const cid = dst[i];
          const newPos = (i + 1) * SPARSE_STEP;
          next.channels[cid] = { ...next.channels[cid], position: newPos } as Channel;
        }
        // after reindex, set pos according to inserted index
        pos = (clampedIndex + 1) * SPARSE_STEP;
      }

      // update channel
      const prevSectionId = channel.sectionId || fromSectionId;
      const updated: Channel = { ...channel, sectionId: toSectionId, position: pos } as Channel;
      next.channels = { ...next.channels, [id]: updated };

      // update lists
      next.channelsBySection[toSectionId] = dst;
      // maintain section.channelIds references for convenience
      if (next.sections[toSectionId]) next.sections[toSectionId].channelIds = dst;
      if (next.sections[fromSectionId]) next.sections[fromSectionId].channelIds = next.channelsBySection[fromSectionId];

      // adjust unread sums across sections if moved
      if (prevSectionId !== toSectionId) {
        const unread = channel.unread || 0;
        if (next.sections[prevSectionId]) next.sections[prevSectionId].unread = Math.max(0, (next.sections[prevSectionId].unread || 0) - unread);
        if (next.sections[toSectionId]) next.sections[toSectionId].unread = (next.sections[toSectionId].unread || 0) + unread;
      }

      return next;
    }, false, 'reorderChannel');
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
})));


