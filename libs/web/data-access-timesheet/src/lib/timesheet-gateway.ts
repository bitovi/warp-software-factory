import { Injectable } from '@angular/core';
import {
  type DateRange,
  type EntryInput,
  type TimeEntry,
  type TimesheetContext,
} from './timesheet-model';

export abstract class TimesheetGateway {
  abstract context(): Promise<TimesheetContext>;
  abstract list(range: DateRange): Promise<TimeEntry[]>;
  abstract create(input: EntryInput): Promise<TimeEntry>;
  abstract update(id: string, input: EntryInput): Promise<TimeEntry>;
  abstract delete(id: string): Promise<void>;
}

export const DEMO_CONTEXT: TimesheetContext = {
  projects: [
    {
      id: 'website',
      name: 'Website refresh',
      client: 'Acme',
      active: true,
      assigned: true,
    },
    {
      id: 'portal',
      name: 'Customer portal',
      client: 'Acme',
      active: true,
      assigned: true,
    },
    {
      id: 'research',
      name: 'Product research',
      client: 'Northstar',
      active: true,
      assigned: true,
    },
    {
      id: 'archived',
      name: 'Archived project',
      client: 'Acme',
      active: false,
      assigned: true,
    },
    {
      id: 'unassigned',
      name: 'Unassigned project',
      client: 'Northstar',
      active: true,
      assigned: false,
    },
  ],
  services: [
    {
      id: 'development',
      name: 'Development',
      projectIds: ['website', 'portal'],
      active: true,
      hourlyRate: 125,
      currency: 'USD',
    },
    {
      id: 'design',
      name: 'Design',
      projectIds: ['website'],
      active: true,
      hourlyRate: 110,
      currency: 'USD',
    },
    {
      id: 'discovery',
      name: 'Discovery',
      projectIds: ['research'],
      active: true,
      hourlyRate: 100,
      currency: 'USD',
    },
  ],
  rules: {
    roundingMinutes: 15,
    maxMinutesPerDay: 480,
    requireDescription: true,
    lockedBefore: '2026-01-01',
  },
};

@Injectable()
export class DemoTimesheetGateway extends TimesheetGateway {
  private entries: TimeEntry[] = [];

  async context(): Promise<TimesheetContext> {
    return structuredClone(DEMO_CONTEXT);
  }

  async list(range: DateRange): Promise<TimeEntry[]> {
    return structuredClone(
      this.entries.filter(
        (item) => item.date >= range.from && item.date <= range.to,
      ),
    );
  }

  async create(input: EntryInput): Promise<TimeEntry> {
    const entry = {
      ...structuredClone(input),
      id: crypto.randomUUID(),
      approved: false,
    };
    this.entries.push(entry);
    return structuredClone(entry);
  }

  async update(id: string, input: EntryInput): Promise<TimeEntry> {
    const existing = this.entries.find((item) => item.id === id);
    if (!existing) throw new Error('Entry no longer exists.');
    const entry = {
      ...structuredClone(input),
      id,
      approved: existing.approved,
    };
    this.entries = this.entries.map((item) => (item.id === id ? entry : item));
    return structuredClone(entry);
  }

  async delete(id: string): Promise<void> {
    this.entries = this.entries.filter((item) => item.id !== id);
  }
}
