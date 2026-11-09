export interface Project {
  id: string;
  name: string;
  client: string;
  active: boolean;
  assigned: boolean;
}

export interface Service {
  id: string;
  name: string;
  projectIds: string[];
  active: boolean;
  hourlyRate: number;
  currency: string;
}

export interface EntryRules {
  roundingMinutes: number;
  maxMinutesPerDay: number;
  requireDescription: boolean;
  lockedBefore: string | null;
}

export interface TimesheetContext {
  projects: Project[];
  services: Service[];
  rules: EntryRules;
}

export interface EntryDraft {
  projectId: string;
  serviceId: string;
  date: string;
  duration: string;
  start: string;
  end: string;
  description: string;
  billable: boolean;
}

export interface EntryInput {
  projectId: string;
  serviceId: string;
  date: string;
  minutes: number;
  start: string | null;
  end: string | null;
  description: string;
  billable: boolean;
  rateSnapshot: { hourlyRate: number; currency: string };
}

export interface TimeEntry extends EntryInput {
  id: string;
  approved: boolean;
}

export type EntryField = keyof EntryDraft | 'form';
export type FieldErrors = Partial<Record<EntryField, string>>;
export interface DateRange {
  from: string;
  to: string;
}
export interface EntryFilters {
  projectId: string;
  billable: 'all' | 'billable' | 'non-billable';
}

export class EntryValidationError extends Error {
  constructor(readonly fields: FieldErrors) {
    super('Check the highlighted fields.');
  }
}
