import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SERVICES_CATALOG,
  parseRate,
  type Service,
} from '@wsf/web/data-access-services';
import { DataTable, HlmButton, type TableColumn } from '@wsf/web/ui';

@Component({
  selector: 'wsf-services-page',
  imports: [DataTable, HlmButton, FormsModule],
  templateUrl: './services-page.html',
  styleUrl: './services-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServicesPage {
  protected readonly catalog = inject(SERVICES_CATALOG);
  @ViewChild('editor') private editor!: ElementRef<HTMLDialogElement>;
  @ViewChild('confirmation')
  private confirmation!: ElementRef<HTMLDialogElement>;
  protected readonly search = signal('');
  protected readonly filter = signal('all');
  protected readonly busy = signal(false);
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly pageError = signal('');
  protected readonly editing = signal<Service | null>(null);
  protected readonly deleting = signal<Service | null>(null);
  protected readonly colors = [
    '#2563eb',
    '#7c3aed',
    '#db2777',
    '#d97706',
    '#059669',
    '#475569',
  ];
  protected name = '';
  protected color = this.colors[0] ?? '#2563eb';
  protected rate = '0.00';
  protected billable = true;
  protected readonly activeCount = computed(
    () =>
      this.catalog.services().filter((service) => service.status === 'active')
        .length,
  );
  protected readonly filtered = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    return this.catalog
      .services()
      .filter(
        (service) =>
          (this.filter() === 'all' || service.status === this.filter()) &&
          service.name.toLocaleLowerCase().includes(query),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  });
  protected readonly columns: readonly TableColumn[] = [
    { key: 'name', label: 'Service name' },
    ...(this.catalog.canViewRates
      ? [{ key: 'rate', label: 'Default rate' }]
      : []),
    { key: 'billable', label: 'Billable' },
    { key: 'status', label: 'Status' },
    ...(this.catalog.canManage ? [{ key: 'actions', label: 'Actions' }] : []),
  ];
  private readonly formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: this.catalog.currency,
  });
  private readonly fractionDigits =
    this.formatter.resolvedOptions().maximumFractionDigits ?? 2;
  protected readonly rateStep = (1 / 10 ** this.fractionDigits).toFixed(
    this.fractionDigits,
  );

  protected formatRate(minor: number | undefined): string {
    return minor === undefined
      ? '—'
      : this.formatter.format(minor / 10 ** this.fractionDigits);
  }

  protected openEditor(service: Service | null = null): void {
    if (!this.catalog.canManage || this.busy()) return;
    this.editing.set(service);
    this.name = service?.name ?? '';
    this.color = service?.color ?? '#2563eb';
    this.billable = service?.billable ?? true;
    this.rate = (
      (service?.defaultRateMinor ?? 0) /
      10 ** this.fractionDigits
    ).toFixed(this.fractionDigits);
    this.error.set('');
    this.editor.nativeElement.showModal();
  }

  protected closeEditor(): void {
    if (!this.busy()) this.editor.nativeElement.close();
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    this.error.set('');
    this.busy.set(true);
    try {
      const draft = {
        name: this.name,
        color: this.color,
        billable: this.billable,
        ...(this.catalog.canViewRates
          ? { defaultRateMinor: parseRate(this.rate, this.catalog.currency) }
          : {}),
      };
      const service = this.editing();
      if (service) await this.catalog.update(service.id, draft);
      else await this.catalog.create(draft);
      this.editor.nativeElement.close();
      this.message.set(
        `“${this.name.trim()}” ${service ? 'updated' : 'created'}.`,
      );
      this.pageError.set('');
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async changeStatus(service: Service): Promise<void> {
    if (this.busy()) return;
    await this.perform(async () => {
      if (service.status === 'active') await this.catalog.archive(service.id);
      else await this.catalog.restore(service.id);
      this.message.set(
        `“${service.name}” ${service.status === 'active' ? 'archived' : 'restored'}.`,
      );
    });
  }

  protected confirmDelete(service: Service): void {
    if (service.usageCount > 0 || this.busy()) return;
    this.deleting.set(service);
    this.error.set('');
    this.confirmation.nativeElement.showModal();
  }

  protected closeConfirmation(): void {
    if (!this.busy()) this.confirmation.nativeElement.close();
  }

  protected async deleteService(): Promise<void> {
    const service = this.deleting();
    if (!service || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.catalog.delete(service.id);
      this.confirmation.nativeElement.close();
      this.message.set(`“${service.name}” deleted.`);
      this.pageError.set('');
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected onCancel(event: Event): void {
    if (this.busy()) event.preventDefault();
  }

  private async perform(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.pageError.set('');
    try {
      await action();
    } catch (error) {
      this.pageError.set(this.errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Could not save the change. Try again.';
  }
}
