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
  syncStatus?: "pending_create" | "pending_update" | "pending_delete" | "synced" | "sync_error" | "conflict";
  conflict?: ItemConflict;
  serverRevision?: number;
  serverUpdatedAt?: string;
  lastSyncedAt?: string;
  /** Device-only restore intent, never sent to the server. */
  restoreNeedsScheduling?: boolean;
  id: string;
  /** Stable master identity for derived occurrences. */
  seriesId?: string;
  /** Stored only on the original occurrence, even after it is completed. */
  dailySeries?: DailySeries;
  occurrenceKey?: string;
  occurrenceHistory?: OccurrenceResult[];
  /** Presentation only; never persisted. */
  preview?: boolean;
  historical?: boolean;
  completedAt?: string;
  dailyHidden?: boolean;

  type: ItemType;

  title: string;

  description: string;

  category?: string | null;

  repeat: RepeatType;
  /** Local weekdays: Sunday = 0 through Saturday = 6. */
  weeklyDays?: number[];

  priority?: Priority | null;

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

  alertBefore?: AlertBefore | null;

  status?: ItemStatus;

  completed?: boolean;

  actionResolved?: boolean;

  notificationIds: string[];

  createdAt: string;

  updatedAt: string;
};

/** Device-only evidence; excluded from itemPayload and server writes. */
export type ItemConflict = {
  expectedRevision?: number;
  serverRevision?: number;
  detectedAt: string;
  serverItem?: ReminderItem;
};

export type DailySeries = {
  masterVersion?: 1;
  /** Legacy storage name retained for compatibility with existing Daily data. */
  repeat?: Exclude<RepeatType, "none">;
  active: boolean;
  firstAt: string;
  templateId: string;
  template: Pick<ReminderItem, "type" | "title" | "description" | "category" | "priority" | "alertBefore" | "startAt" | "endAt" | "allDay" | "location" | "notes" | "weeklyDays">;
  excludedDates: string[];
  notificationIds: string[];
  dirty: boolean;
};

export type OccurrenceResult = { occurrenceKey: string; scheduledAt: string; status: ItemStatus; completedAt?: string; completionNote?: string; actionResolved?: boolean };
