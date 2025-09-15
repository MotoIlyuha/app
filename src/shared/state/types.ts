export type Id = string;
export type NotificationMode = 'all' | 'mentions' | 'none';

export interface Section {
  id: Id;
  title: string;
  collapsed: boolean;
  channelIds: Id[];
  unread: number;
  position: number;
}

export interface Channel {
  id: Id;
  sectionId: Id | null;
  title: string;
  unread: number;
  lastMessageTs: number;
  position: number;
  hidden?: boolean;
  notifications: NotificationMode;
  muted?: boolean;
  threadIds: Id[];
}

export interface Thread {
  id: Id;
  channelId: Id;
  title: string;
  unread: number;
  lastMessageTs: number;
  hasMention?: boolean;
  notifications?: NotificationMode;
}


