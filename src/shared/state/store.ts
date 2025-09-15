import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Channel, Id, Section, Thread } from './types';
import type { ChannelDTO, SectionDTO, ThreadDTO } from '../api/types';

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
}

export interface Actions {
  loadInitial: (data: { sections: SectionDTO[]; channels: ChannelDTO[]; threads: ThreadDTO[] }) => void;
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

export const useStore = create<StoreState>()(devtools((set) => ({
  ...initial,
  loadInitial: ({ sections, channels, threads }) => {
    const state: EntitiesState & UiState = {
      ...initial,
    };

    // Sections
    for (const s of sections) {
      const section: Section = {
        id: s.id,
        title: s.title,
        collapsed: false,
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
})));


