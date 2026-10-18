export interface CalendarNote {
  id: string;
  date: string; // "YYYY-MM-DD"
  title: string;
  body?: string;
  notifyAt?: string; // "HH:mm" - time to send notification
}
