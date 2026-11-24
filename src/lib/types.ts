export type Room = {
  id: number;
  name: string;
  location: string;
  enabled: number;
};
export type SavedDraft = {
  id: number;
  roomName: string;
  eventName: string;
  purpose: string;
  date: string;
  start: string;
  end: string;
  attendees: number;
  displayName: string;
};
