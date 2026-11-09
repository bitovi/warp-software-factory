import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  BrnDialogDescription,
  BrnDialogRef,
  BrnDialogTitle,
  injectBrnDialogContext,
} from '@spartan-ng/brain/dialog';
import {
  formatMinutes,
  parseTime,
  saveErrors,
  type EntryDraft,
  type EntryField,
  type FieldErrors,
  type TimeEntry,
  TimesheetStore,
} from '@wsf/web/data-access-timesheet';
import { HlmButton } from '@wsf/web/ui';

export interface EntryDialogContext {
  store: TimesheetStore;
  date: string;
  entry?: TimeEntry;
}

@Component({
  selector: 'wsf-entry-dialog',
  imports: [FormsModule, HlmButton, BrnDialogTitle, BrnDialogDescription],
  templateUrl: './entry-dialog.html',
  styleUrl: './timesheet.css',
  host: { class: 'entry-dialog', '(keydown.escape)': 'close()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntryDialog {
  private readonly context = injectBrnDialogContext<EntryDialogContext>();
  private readonly dialog = inject(BrnDialogRef);
  protected readonly store = this.context.store;
  protected readonly existing = this.context.entry;
  protected readonly draft = signal<EntryDraft>(this.initialDraft());
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly touched = signal<ReadonlySet<EntryField>>(new Set());
  protected readonly serverErrors = signal<FieldErrors>({});
  protected readonly hasServerErrors = computed(() =>
    Object.values(this.serverErrors()).some(Boolean),
  );
  protected readonly validation = computed(() =>
    this.store.validate(this.draft(), this.existing),
  );
  protected readonly groups = computed(() => {
    const projects =
      this.store
        .context()
        ?.projects.filter((item) => item.assigned && item.active) ?? [];
    return [...new Set(projects.map((item) => item.client))]
      .sort()
      .map((client) => ({
        client,
        projects: projects.filter((item) => item.client === client),
      }));
  });
  protected readonly services = computed(
    () =>
      this.store
        .context()
        ?.services.filter(
          (item) =>
            item.active && item.projectIds.includes(this.draft().projectId),
        ) ?? [],
  );
  protected readonly preview = computed(() => {
    const raw = this.validation().rawMinutes;
    const step = this.store.context()?.rules.roundingMinutes ?? 1;
    return raw ? formatMinutes(Math.ceil(raw / step) * step) : '—';
  });
  protected readonly rate = computed(() => {
    const draft = this.draft();
    if (
      this.existing?.projectId === draft.projectId &&
      this.existing.serviceId === draft.serviceId
    ) {
      return this.existing.rateSnapshot;
    }
    return this.services().find((item) => item.id === draft.serviceId);
  });

  protected error(field: EntryField): string | undefined {
    return (
      this.serverErrors()[field] ??
      (this.submitted() || this.touched().has(field) || field === 'form'
        ? this.validation().errors[field]
        : undefined)
    );
  }

  protected change<K extends keyof EntryDraft>(
    field: K,
    value: EntryDraft[K],
  ): void {
    this.draft.update((draft) => ({
      ...draft,
      [field]: value,
      ...(field === 'projectId' ? { serviceId: '' } : {}),
    }));
    this.touched.update((fields) => new Set([...fields, field]));
    this.serverErrors.update((errors) => ({
      ...errors,
      [field]: undefined,
      form: undefined,
      ...(field === 'projectId' ? { serviceId: undefined } : {}),
    }));
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    this.submitted.set(true);
    this.serverErrors.set({});
    if (!this.validation().input) return;
    this.saving.set(true);
    try {
      await this.store.save(this.draft(), this.existing?.id);
      this.dialog.close(true);
    } catch (error) {
      this.serverErrors.set(saveErrors(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected close(): void {
    if (!this.saving()) this.dialog.close();
  }

  private initialDraft(): EntryDraft {
    const entry = this.existing;
    if (!entry) return this.store.newDraft(this.context.date);
    const start = entry.start ? parseTime(entry.start) : null;
    const end = entry.end ? parseTime(entry.end) : null;
    return {
      projectId: entry.projectId,
      serviceId: entry.serviceId,
      date: entry.date,
      duration: `${start !== null && end !== null ? end - start : entry.minutes}m`,
      start: entry.start ?? '',
      end: entry.end ?? '',
      description: entry.description,
      billable: entry.billable,
    };
  }
}
