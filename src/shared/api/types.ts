// API DTO contracts
export interface SectionDTO {
  id: string;
  title: string;
  position?: number;
}

export type NotificationMode = 'all' | 'mentions' | 'none';

export interface ChannelDTO {
  id: string;
  sectionId: string | null;
  title: string;
  position?: number;
  notificationMode?: NotificationMode;
  muted?: boolean;
  unreadCount?: number;
  lastMessageTs?: number;
}

export interface ThreadDTO {
  id: string;
  channelId: string;
  title: string;
  unreadCount?: number;
  lastMessageTs?: number;
  hasMention?: boolean;
  notificationMode?: NotificationMode;
}

export interface ApiError extends Error {
  status?: number;
  requestId?: string;
}


