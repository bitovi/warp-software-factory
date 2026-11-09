import {
  EntryValidationError,
  type EntryDraft,
  type EntryInput,
  type FieldErrors,
  type TimeEntry,
  type TimesheetContext,
} from './timesheet-model';

export function parseDuration(value: string): number | null {
  const text = value.trim().toLowerCase();
  let minutes: number;
  const clock = /^(\d+):([0-5]\d)$/.exec(text);
  if (clock) {
    minutes = Number(clock[1]) * 60 + Number(clock[2]);
  } else if (/^\d+(?:\.\d+)?m$/.test(text)) {
    minutes = Number(text.slice(0, -1));
  } else if (/^(?:\d+(?:\.\d+)?|\.\d+)h?$/.test(text)) {
    minutes = Number(text.replace(/h$/, '')) * 60;
  } else {
    return null;
  }
  const whole = Math.round(minutes);
  return Number.isSafeInteger(whole) &&
    whole > 0 &&
    Math.abs(minutes - whole) <= Number.EPSILON * Math.abs(minutes) * 2
    ? whole
    : null;
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01') return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekStart(value: string): string {
  const day = new Date(`${value}T00:00:00Z`).getUTCDay();
  return shiftDate(value, -((day + 6) % 7));
}

export function formatMinutes(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function parseTime(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

export function entryLocked(
  entry: TimeEntry,
  context: TimesheetContext,
): boolean {
  return (
    entry.approved ||
    (context.rules.lockedBefore !== null &&
      entry.date < context.rules.lockedBefore)
  );
}

export function validateDraft(
  draft: EntryDraft,
  context: TimesheetContext,
  entries: readonly TimeEntry[],
  existing?: TimeEntry,
): {
  errors: FieldErrors;
  input: EntryInput | null;
  rawMinutes: number | null;
} {
  const errors: FieldErrors = {};
  const { rules } = context;
  const project = context.projects.find(
    (item) => item.id === draft.projectId && item.assigned && item.active,
  );
  const service = context.services.find(
    (item) =>
      item.id === draft.serviceId &&
      item.active &&
      item.projectIds.includes(draft.projectId),
  );
  if (!project) errors.projectId = 'Choose an assigned, active project.';
  if (!service) errors.serviceId = 'Choose a service for this project.';
  if (!validDate(draft.date)) errors.date = 'Enter a valid date.';
  else if (rules.lockedBefore && draft.date < rules.lockedBefore) {
    errors.date = `Dates before ${rules.lockedBefore} are locked.`;
  }
  if (existing && entryLocked(existing, context)) {
    errors.form = 'This entry is approved or in a locked period.';
  }
  const rawMinutes = parseDuration(draft.duration);
  const minutes = rawMinutes
    ? Math.ceil(rawMinutes / rules.roundingMinutes) * rules.roundingMinutes
    : 0;
  if (!rawMinutes) {
    errors.duration =
      'Use hours (1.5), hours:minutes (1:30), or minutes (90m).';
  } else {
    const used = entries
      .filter((item) => item.date === draft.date && item.id !== existing?.id)
      .reduce((sum, item) => sum + item.minutes, 0);
    if (minutes > 1440 || minutes + used > rules.maxMinutesPerDay) {
      errors.duration = `Daily limit is ${formatMinutes(rules.maxMinutesPerDay)}, including other entries.`;
    }
  }
  if (rules.requireDescription && !draft.description.trim()) {
    errors.description = 'Describe the work performed.';
  }
  if (draft.start || draft.end) {
    const start = parseTime(draft.start);
    const end = parseTime(draft.end);
    if (start === null) errors.start = 'Enter a start time (HH:mm).';
    if (end === null) errors.end = 'Enter an end time (HH:mm).';
    if (start !== null && end !== null) {
      if (end <= start)
        errors.end = 'End must be after start on the same date.';
      else if (rawMinutes && end - start !== rawMinutes) {
        errors.duration =
          'Duration must match the start/end interval before rounding.';
      }
    }
  }
  return {
    errors,
    rawMinutes,
    input:
      Object.keys(errors).length || !service
        ? null
        : {
            projectId: draft.projectId,
            serviceId: draft.serviceId,
            date: draft.date,
            minutes,
            start: draft.start || null,
            end: draft.end || null,
            description: draft.description.trim(),
            billable: draft.billable,
            rateSnapshot:
              existing?.projectId === draft.projectId &&
              existing.serviceId === draft.serviceId
                ? existing.rateSnapshot
                : {
                    hourlyRate: service.hourlyRate,
                    currency: service.currency,
                  },
          },
  };
}

export function saveErrors(error: unknown): FieldErrors {
  return error instanceof EntryValidationError
    ? error.fields
    : {
        form: 'Could not save the entry. Your changes were rolled back. Try again.',
      };
}
