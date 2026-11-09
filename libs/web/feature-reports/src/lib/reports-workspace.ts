import { DOCUMENT, DatePipe, DecimalPipe, CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import {
  createExport,
  DATE_PRESETS,
  DEMO_PERMISSIONS,
  ExportFormat,
  filtersFromUrl,
  filtersToUrl,
  ReportFilters,
  ReportsStore,
  validDate,
} from '@wsf/web/data-access-reports';
import { StatusPage } from '@wsf/web/feature-status';
import { ReportChart } from './report-chart';

@Component({
  selector: 'wsf-reports-workspace',
  imports: [DatePipe, DecimalPipe, CurrencyPipe, StatusPage, ReportChart],
  templateUrl: './reports-workspace.html',
  styleUrl: './reports-workspace.css',
  host: {
    '(document:click)': 'dismissPopovers($event)',
    '(document:keydown.escape)': 'dismissPopovers()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsWorkspace {
  protected readonly store = inject(ReportsStore);
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView!;
  private readonly destroyRef = inject(DestroyRef);
  protected readonly presets = DATE_PRESETS;
  protected readonly page = signal(
    this.window.location.pathname === '/status' ? 'status' : 'reports',
  );
  protected readonly access = signal('manager');
  protected readonly expanded = signal(new Set<string>());
  protected readonly exporting = signal(false);
  protected readonly message = signal('');
  protected readonly dateError = signal('');
  protected readonly exportOpen = signal(false);
  private readonly filterMenus =
    viewChildren<ElementRef<HTMLDetailsElement>>('filterMenu');
  private readonly exportElement =
    viewChild<ElementRef<HTMLElement>>('exportWrapper');
  protected readonly multiFilters = [
    { key: 'projects', label: 'Projects' },
    { key: 'clients', label: 'Clients' },
    { key: 'people', label: 'People' },
  ] as const;

  constructor() {
    const restore = () => {
      this.page.set(
        this.window.location.pathname === '/status' ? 'status' : 'reports',
      );
      this.store.update(
        filtersFromUrl(new URLSearchParams(this.window.location.search)),
      );
      this.expanded.set(new Set());
      this.dateError.set('');
    };
    restore();
    this.window.addEventListener('popstate', restore);
    this.destroyRef.onDestroy(() =>
      this.window.removeEventListener('popstate', restore),
    );
  }

  protected dismissPopovers(event?: Event): void {
    for (const { nativeElement: menu } of this.filterMenus()) {
      if (!event || !menu.contains(event.target as Node)) {
        if (!event && menu.open) menu.querySelector('summary')?.focus();
        menu.open = false;
      }
    }
    const wrapper = this.exportElement()?.nativeElement;
    if (!event || !wrapper?.contains(event.target as Node)) {
      if (!event && this.exportOpen())
        wrapper?.querySelector('button')?.focus();
      this.exportOpen.set(false);
    }
  }

  protected navigate(page: 'reports' | 'status'): void {
    this.page.set(page);
    this.syncUrl();
  }

  protected update(patch: Partial<ReportFilters>): void {
    this.store.update(patch);
    this.expanded.set(new Set());
    this.message.set('');
    this.syncUrl();
  }

  private syncUrl(): void {
    const url = new URL(this.window.location.href);
    url.pathname = this.page() === 'reports' ? '/reports' : '/status';
    url.search = filtersToUrl(
      this.store.filters(),
      url.searchParams,
    ).toString();
    if (url.href !== this.window.location.href)
      this.window.history.pushState(null, '', url);
  }

  protected setDate(key: 'from' | 'to', control: HTMLInputElement): void {
    const value = control.value;
    if (!validDate(value)) {
      this.dateError.set('Enter a valid start and end date.');
      control.value = this.store.filters()[key];
      return;
    }
    const filters = { ...this.store.filters(), [key]: value };
    if (filters.from > filters.to) {
      this.dateError.set('Start date must be on or before end date.');
      control.value = this.store.filters()[key];
      return;
    }
    this.dateError.set('');
    this.update({ [key]: value });
  }

  protected selectPreset(value: string): void {
    const preset = this.presets.find((item) => item.label === value);
    if (preset) {
      this.dateError.set('');
      this.update({ from: preset.from, to: preset.to });
    }
  }

  protected activePreset(): string {
    const filters = this.store.filters();
    return (
      this.presets.find(
        (item) => item.from === filters.from && item.to === filters.to,
      )?.label ?? ''
    );
  }

  protected toggleFilter(
    key: 'projects' | 'clients' | 'people',
    value: string,
  ): void {
    const selected = this.store.filters()[key];
    this.update({
      [key]: selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    });
  }

  protected selectValue(
    key: 'billable' | 'status' | 'groupBy' | 'split',
    value: string,
  ): void {
    this.update({ [key]: value });
  }

  protected reset(): void {
    this.store.reset();
    this.expanded.set(new Set());
    this.dateError.set('');
    this.message.set('');
    this.syncUrl();
  }

  protected toggleGroup(name: string): void {
    this.expanded.update((previous) => {
      const next = new Set(previous);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  protected expandAll(): void {
    this.expanded.set(
      this.expanded().size === this.store.groups().length
        ? new Set()
        : new Set(this.store.groups().map((group) => group.name)),
    );
  }

  protected setAccess(value: string): void {
    this.access.set(value);
    DEMO_PERMISSIONS.set(
      value === 'manager'
        ? ['reports:view', 'reports:financial']
        : value === 'member'
          ? ['reports:view']
          : [],
    );
    this.exportOpen.set(false);
    this.message.set('');
    this.expanded.set(new Set());
  }

  protected async export(format: ExportFormat): Promise<void> {
    if (this.exporting() || !this.store.canView()) return;
    const snapshot = this.store.snapshot();
    this.exporting.set(true);
    this.exportOpen.set(false);
    this.message.set(`Preparing ${format.toUpperCase()}…`);
    try {
      const blob = await createExport(snapshot, format);
      if (
        !this.store.canView() ||
        (snapshot.financial && !this.store.canViewFinancial())
      ) {
        throw new Error('Access changed. Export cancelled.');
      }
      const url = this.window.URL.createObjectURL(blob);
      const link = this.document.createElement('a');
      link.href = url;
      link.download = `time-report-${snapshot.filters.from}-${snapshot.filters.to}-${snapshot.filters.view}.${format}`;
      link.click();
      this.window.setTimeout(() => this.window.URL.revokeObjectURL(url), 1000);
      this.message.set(
        `${format.toUpperCase()} downloaded · ${snapshot.entries.length} entries · ${snapshot.filters.groupBy} grouping`,
      );
    } catch {
      this.message.set(
        'Export could not complete. Check your access and try again.',
      );
    } finally {
      this.exporting.set(false);
    }
  }
}
