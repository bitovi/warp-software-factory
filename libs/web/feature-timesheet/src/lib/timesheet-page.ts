import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrnDialogService } from '@spartan-ng/brain/dialog';
import {
  DemoTimesheetGateway,
  entryLocked,
  formatMinutes,
  localDate,
  saveErrors,
  shiftDate,
  TimesheetGateway,
  TimesheetStore,
  type EntryFilters,
  type TimeEntry,
} from '@wsf/web/data-access-timesheet';
import { HlmButton } from '@wsf/web/ui';
import { EntryDialog, type EntryDialogContext } from './entry-dialog';

@Component({
  selector: 'wsf-timesheet-page',
  imports: [FormsModule, HlmButton],
  providers: [
    TimesheetStore,
    { provide: TimesheetGateway, useClass: DemoTimesheetGateway },
  ],
  templateUrl: './timesheet-page.html',
  styleUrl: './timesheet.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimesheetPage {
  protected readonly store = inject(TimesheetStore);
  private readonly dialogs = inject(BrnDialogService);
  protected readonly formatMinutes = formatMinutes;
  protected readonly days = computed(() =>
    Array.from({ length: 7 }, (_, day) =>
      shiftDate(this.store.range().from, day),
    ),
  );
  protected readonly deleteError = signal('');

  constructor() {
    void this.store.load();
  }

  protected open(date = localDate(), entry?: TimeEntry): void {
    if (!this.store.context()) return;
    this.dialogs.open<EntryDialogContext>(
      EntryDialog,
      undefined,
      { store: this.store, date, entry },
      {
        panelClass: 'time-entry-panel',
        backdropClass: 'time-entry-backdrop',
        closeOnOutsidePointerEvents: false,
        disableClose: true,
        autoFocus: '#entry-project',
      },
    );
  }

  protected moveWeek(offset: number): void {
    const from = shiftDate(this.store.range().from, offset * 7);
    void this.store.load({ from, to: shiftDate(from, 6) });
  }

  protected filter<K extends keyof EntryFilters>(
    field: K,
    value: EntryFilters[K],
  ): void {
    this.store.setFilters({ ...this.store.filters(), [field]: value });
  }

  protected projectName(id: string): string {
    return (
      this.store.context()?.projects.find((item) => item.id === id)?.name ?? id
    );
  }

  protected serviceName(id: string): string {
    return (
      this.store.context()?.services.find((item) => item.id === id)?.name ?? id
    );
  }

  protected locked(entry: TimeEntry): boolean {
    const context = this.store.context();
    return (
      !context ||
      entryLocked(entry, context) ||
      this.store.pending().has(entry.id)
    );
  }

  protected async remove(entry: TimeEntry): Promise<void> {
    this.deleteError.set('');
    try {
      await this.store.delete(entry.id);
    } catch (error) {
      const errors = saveErrors(error);
      this.deleteError.set(errors.form ?? 'Could not delete entry. Try again.');
    }
  }
}
