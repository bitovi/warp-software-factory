import { computed, inject, Injectable, signal } from '@angular/core';
import {
  entryLocked,
  localDate,
  shiftDate,
  validDate,
  validateDraft,
  weekStart,
} from './entry-rules';
import { TimesheetGateway } from './timesheet-gateway';
import {
  EntryValidationError,
  type DateRange,
  type EntryDraft,
  type EntryFilters,
  type TimeEntry,
  type TimesheetContext,
} from './timesheet-model';

@Injectable()
export class TimesheetStore {
  private readonly gateway = inject(TimesheetGateway);
  private readonly allEntries = signal<TimeEntry[]>([]);
  private readonly contextState = signal<TimesheetContext | null>(null);
  private readonly rangeState = signal<DateRange>({
    from: weekStart(localDate()),
    to: shiftDate(weekStart(localDate()), 6),
  });
  private readonly filterState = signal<EntryFilters>({
    projectId: '',
    billable: 'all',
  });
  private readonly pendingState = signal<ReadonlySet<string>>(new Set());
  private readonly loadingState = signal(false);
  private readonly errorState = signal('');
  private loadGeneration = 0;
  private mutationRevision = 0;
  private reloadRequested = false;
  private preferences = this.readPreferences();

  readonly context = this.contextState.asReadonly();
  readonly range = this.rangeState.asReadonly();
  readonly filters = this.filterState.asReadonly();
  readonly pending = this.pendingState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly entries = computed(() => {
    const range = this.range();
    const filters = this.filters();
    return this.allEntries()
      .filter(
        (item) =>
          item.date >= range.from &&
          item.date <= range.to &&
          (!filters.projectId || item.projectId === filters.projectId) &&
          (filters.billable === 'all' ||
            item.billable === (filters.billable === 'billable')),
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  });
  readonly totalsPerDay = computed(() =>
    this.entries().reduce<Record<string, number>>(
      (totals, item) => ({
        ...totals,
        [item.date]: (totals[item.date] ?? 0) + item.minutes,
      }),
      {},
    ),
  );
  readonly totalsPerWeek = computed(() =>
    this.entries().reduce<Record<string, number>>((totals, item) => {
      const week = weekStart(item.date);
      totals[week] = (totals[week] ?? 0) + item.minutes;
      return totals;
    }, {}),
  );
  readonly totalMinutes = computed(() =>
    this.entries().reduce((sum, item) => sum + item.minutes, 0),
  );

  async load(range: DateRange = this.range()): Promise<void> {
    if (
      !validDate(range.from) ||
      !validDate(range.to) ||
      range.from > range.to
    ) {
      this.errorState.set('Choose a valid date range.');
      return;
    }
    this.rangeState.set({ ...range });
    const generation = ++this.loadGeneration;
    const revision = this.mutationRevision;
    this.loadingState.set(true);
    this.errorState.set('');
    try {
      const [context, entries] = await Promise.all([
        this.gateway.context(),
        this.gateway.list(range),
      ]);
      if (generation !== this.loadGeneration) return;
      this.contextState.set(context);
      // A response started before a mutation cannot replace optimistic or committed data.
      if (revision === this.mutationRevision && !this.pending().size) {
        const fetchedIds = new Set(entries.map((item) => item.id));
        this.allEntries.update((current) => [
          ...current.filter(
            (item) =>
              (item.date < range.from || item.date > range.to) &&
              !fetchedIds.has(item.id),
          ),
          ...entries,
        ]);
      } else if (!this.pending().size) {
        await this.load();
      } else {
        this.reloadRequested = true;
      }
    } catch {
      if (generation === this.loadGeneration)
        this.errorState.set('Could not load timesheet. Try again.');
    } finally {
      if (generation === this.loadGeneration) this.loadingState.set(false);
    }
  }

  setFilters(filters: EntryFilters): void {
    this.filterState.set({ ...filters });
  }

  newDraft(date: string): EntryDraft {
    const context = this.context();
    const project = context?.projects.find(
      (item) =>
        item.id === this.preferences.projectId && item.active && item.assigned,
    );
    const service = context?.services.find(
      (item) =>
        item.id === this.preferences.serviceId &&
        item.active &&
        item.projectIds.includes(project?.id ?? ''),
    );
    return {
      projectId: project?.id ?? '',
      serviceId: service?.id ?? '',
      date,
      duration: '',
      start: '',
      end: '',
      description: '',
      billable: true,
    };
  }

  validate(draft: EntryDraft, existing?: TimeEntry) {
    const context = this.context();
    if (!context) throw new Error('Timesheet is not loaded.');
    return validateDraft(draft, context, this.allEntries(), existing);
  }

  async save(draft: EntryDraft, id?: string): Promise<TimeEntry> {
    const existing = id
      ? this.allEntries().find((item) => item.id === id)
      : undefined;
    if (id && !existing)
      throw new EntryValidationError({ form: 'Entry no longer exists.' });
    if (id && this.pending().has(id))
      throw new EntryValidationError({
        form: 'Wait for this entry to finish saving.',
      });
    const result = this.validate(draft, existing);
    if (!result.input) throw new EntryValidationError(result.errors);
    const key = id ?? `pending-${crypto.randomUUID()}`;
    const optimistic: TimeEntry = {
      ...result.input,
      id: key,
      approved: existing?.approved ?? false,
    };
    this.begin(key);
    this.allEntries.update((items) =>
      existing
        ? items.map((item) => (item.id === id ? optimistic : item))
        : [...items, optimistic],
    );
    try {
      const saved = id
        ? await this.gateway.update(id, result.input)
        : await this.gateway.create(result.input);
      this.allEntries.update((items) =>
        items.map((item) => (item.id === key ? saved : item)),
      );
      this.remember(draft);
      return saved;
    } catch (error) {
      this.allEntries.update((items) =>
        existing
          ? items.map((item) => (item.id === key ? existing : item))
          : items.filter((item) => item.id !== key),
      );
      throw error;
    } finally {
      this.end(key);
    }
  }

  async delete(id: string): Promise<void> {
    const entry = this.allEntries().find((item) => item.id === id);
    const context = this.context();
    if (!entry || !context)
      throw new EntryValidationError({ form: 'Entry no longer exists.' });
    if (this.pending().has(id))
      throw new EntryValidationError({
        form: 'Wait for this entry to finish saving.',
      });
    if (entryLocked(entry, context))
      throw new EntryValidationError({
        form: 'This entry is approved or in a locked period.',
      });
    this.begin(id);
    this.allEntries.update((items) => items.filter((item) => item.id !== id));
    try {
      await this.gateway.delete(id);
    } catch (error) {
      this.allEntries.update((items) => [...items, entry]);
      throw error;
    } finally {
      this.end(id);
    }
  }

  private begin(id: string): void {
    this.mutationRevision++;
    this.pendingState.update((ids) => new Set([...ids, id]));
  }

  private end(id: string): void {
    this.mutationRevision++;
    this.pendingState.update(
      (ids) => new Set([...ids].filter((item) => item !== id)),
    );
    if (this.reloadRequested && !this.pending().size) {
      this.reloadRequested = false;
      void this.load();
    }
  }

  private readPreferences(): { projectId: string; serviceId: string } {
    try {
      const value: unknown = JSON.parse(
        globalThis.localStorage?.getItem('wsf.time-entry.defaults') ?? 'null',
      );
      if (
        value &&
        typeof value === 'object' &&
        'projectId' in value &&
        'serviceId' in value &&
        typeof value.projectId === 'string' &&
        typeof value.serviceId === 'string'
      ) {
        return { projectId: value.projectId, serviceId: value.serviceId };
      }
    } catch {
      /* Storage is optional in private browsing and non-browser rendering. */
    }
    return { projectId: '', serviceId: '' };
  }

  private remember(draft: EntryDraft): void {
    this.preferences = {
      projectId: draft.projectId,
      serviceId: draft.serviceId,
    };
    try {
      globalThis.localStorage?.setItem(
        'wsf.time-entry.defaults',
        JSON.stringify(this.preferences),
      );
    } catch {
      /* In-memory defaults remain available when browser storage is blocked. */
    }
  }
}
