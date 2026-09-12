export type ItemType =
  | "reminder"
  | "task"
  | "event"
  | "birthday";

export type RepeatType =
  | "none"
  | "daily"
  | "weekly"
  | "weekdays"
  | "monthly"
  | "yearly";

export type ItemStatus =
  | "Pending"
  | "Done"
  | "Missed"
  | "Overdue"
  | "Upcoming"
  | "Ongoing"
  | "Completed"
  | "Cancelled";

export type Priority =
  | "High"
  | "Medium"
  | "Low";

export type AlertBefore = {
  label: string;
  minutes: number;
};

export type ReminderItem = {
  id: string;

  type: ItemType;

  title: string;

  description: string;

  category: string;

  repeat: RepeatType;

  priority?: Priority;

  startAt: string;

  endAt?: string;

  allDay?: boolean;

  location?: string;

  notes?: string;

  /*
   * Optional note added
   * when user marks item Done.
   */
  completionNote?: string;

  alertBefore: AlertBefore;

  status?: ItemStatus;

  completed?: boolean;

  actionResolved?: boolean;

  notificationIds: string[];

  createdAt: string;

  updatedAt: string;
};