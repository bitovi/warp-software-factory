import { computed, inject, Injectable, signal } from '@angular/core';
import {
  DEFAULT_FILTERS,
  filterEntries,
  groupEntries,
  normalizeFilters,
  ReportFilters,
  summarize,
  TimeEntry,
} from './reports-model';
import { REPORTS_SOURCE } from './reports-source';

@Injectable({ providedIn: 'root' })
export class ReportsStore {
  private readonly source = inject(REPORTS_SOURCE);
  private readonly state = signal(normalizeFilters(DEFAULT_FILTERS));
  readonly filters = this.state.asReadonly();
  readonly canView = computed(() =>
    this.source.permissions().includes('reports:view'),
  );
  readonly canViewFinancial = computed(
    () =>
      this.canView() && this.source.permissions().includes('reports:financial'),
  );
  private readonly accessibleEntries = computed(() => {
    if (!this.canView()) return [];
    return this.source.entries().map((entry): TimeEntry => {
      const { amount, ...safe } = entry;
      return this.canViewFinancial() ? { ...safe, amount } : safe;
    });
  });
  readonly options = computed(() => {
    const values = (key: 'project' | 'client' | 'person') =>
      [...new Set(this.accessibleEntries().map((entry) => entry[key]))].sort();
    return {
      projects: values('project'),
      clients: values('client'),
      people: values('person'),
    };
  });
  readonly entries = computed(() =>
    filterEntries(this.accessibleEntries(), this.filters()),
  );
  readonly summary = computed(() =>
    summarize(this.entries(), this.canViewFinancial()),
  );
  readonly groups = computed(() =>
    groupEntries(
      this.entries(),
      this.filters().groupBy,
      this.canViewFinancial(),
    ),
  );
  readonly trend = computed(() =>
    groupEntries(this.entries(), 'date', false).map((group) => ({
      label: group.name,
      hours: group.summary.hours,
    })),
  );
  readonly split = computed(() =>
    groupEntries(this.entries(), this.filters().split, false).map((group) => ({
      label: group.name,
      hours: group.summary.hours,
    })),
  );

  update(patch: Partial<ReportFilters>): void {
    this.state.update((filters) => normalizeFilters({ ...filters, ...patch }));
  }

  reset(): void {
    this.state.set(normalizeFilters(DEFAULT_FILTERS));
  }

  snapshot() {
    if (!this.canView()) throw new Error('Reports access is required.');
    return {
      filters: structuredClone(this.filters()),
      entries: structuredClone(this.entries()),
      financial: this.canViewFinancial(),
    };
  }
}
