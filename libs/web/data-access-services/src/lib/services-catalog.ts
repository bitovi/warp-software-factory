import { computed, InjectionToken, signal, type Signal } from '@angular/core';
import { z } from 'zod';

export interface ServiceAccess {
  readonly companyAdmin: boolean;
  readonly permissions: readonly string[];
  readonly currency: string;
}

export interface Service {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly billable: boolean;
  readonly status: 'active' | 'archived';
  readonly usageCount: number;
  readonly defaultRateMinor?: number;
}

export interface ServiceRecord extends Service {
  readonly defaultRateMinor: number;
}

export interface ServiceDraft {
  readonly name: string;
  readonly color: string;
  readonly billable: boolean;
  readonly defaultRateMinor?: number;
}

export type ServiceOption = Pick<Service, 'id' | 'name' | 'color'>;

export interface ServicesCatalog {
  readonly services: Signal<readonly Service[]>;
  readonly activeOptions: Signal<readonly ServiceOption[]>;
  readonly canManage: boolean;
  readonly canViewRates: boolean;
  readonly currency: string;
  create(draft: ServiceDraft): Promise<void>;
  update(id: string, draft: ServiceDraft): Promise<void>;
  archive(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  delete(id: string): Promise<void>;
}

const draftSchema = z.object({
  name: z.string().trim().min(1, 'Enter a service name.').max(80),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'Choose a valid color.'),
  billable: z.boolean(),
  defaultRateMinor: z.number().int().min(0).max(99_999_999).optional(),
});

export function parseRate(value: string, currency: string): number {
  const digits =
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  const pattern = new RegExp(
    digits === 0 ? '^\\d+$' : `^\\d+(?:\\.\\d{1,${digits}})?$`,
  );
  if (!pattern.test(value.trim())) {
    throw new Error(`Enter a non-negative rate with up to ${digits} decimals.`);
  }
  const [whole = '0', fraction = ''] = value.trim().split('.');
  const minor =
    Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0'));
  if (!Number.isSafeInteger(minor) || minor > 99_999_999) {
    throw new Error('The rate is too large.');
  }
  return minor;
}

export class SessionServicesCatalog implements ServicesCatalog {
  private readonly records;
  readonly canManage: boolean;
  readonly canViewRates: boolean;
  readonly currency: string;
  readonly services: Signal<readonly Service[]>;
  readonly activeOptions: Signal<readonly ServiceOption[]>;

  constructor(access: ServiceAccess, initial: readonly ServiceRecord[] = []) {
    this.canManage = access.companyAdmin;
    this.canViewRates = access.permissions.includes('rates:view');
    this.currency = access.currency;
    this.records = signal<readonly ServiceRecord[]>(
      initial.map((record) => ({ ...record })),
    );
    this.services = computed(() =>
      this.records().map(({ defaultRateMinor, ...service }) =>
        this.canViewRates ? { ...service, defaultRateMinor } : service,
      ),
    );
    this.activeOptions = computed(() =>
      this.records()
        .filter((service) => service.status === 'active')
        .map(({ id, name, color }) => ({ id, name, color })),
    );
  }

  async create(draft: ServiceDraft): Promise<void> {
    this.assertManage();
    const valid = this.validate(draft);
    this.records.update((records) => [
      ...records,
      {
        ...valid,
        id: crypto.randomUUID(),
        defaultRateMinor: valid.defaultRateMinor ?? 0,
        status: 'active',
        usageCount: 0,
      },
    ]);
  }

  async update(id: string, draft: ServiceDraft): Promise<void> {
    this.assertManage();
    const current = this.find(id);
    const valid = this.validate(draft, id);
    this.replace(id, {
      ...current,
      ...valid,
      defaultRateMinor: valid.defaultRateMinor ?? current.defaultRateMinor,
    });
  }

  async archive(id: string): Promise<void> {
    this.assertManage();
    this.replace(id, { ...this.find(id), status: 'archived' });
  }

  async restore(id: string): Promise<void> {
    this.assertManage();
    this.replace(id, { ...this.find(id), status: 'active' });
  }

  async delete(id: string): Promise<void> {
    this.assertManage();
    if (this.find(id).usageCount > 0) {
      throw new Error(
        'This service is in use. Archive it to keep its history.',
      );
    }
    this.records.update((records) =>
      records.filter((record) => record.id !== id),
    );
  }

  private assertManage(): void {
    if (!this.canManage) {
      throw new Error('Only company admins can manage services.');
    }
  }

  private validate(draft: ServiceDraft, id?: string): ServiceDraft {
    const result = draftSchema.safeParse(draft);
    if (!result.success) {
      throw new Error(result.error.issues[0]?.message ?? 'Check the service.');
    }
    if (!this.canViewRates && draft.defaultRateMinor !== undefined) {
      throw new Error('You do not have permission to change rates.');
    }
    if (
      this.records().some(
        (record) =>
          record.id !== id &&
          record.name.toLocaleLowerCase() ===
            result.data.name.toLocaleLowerCase(),
      )
    ) {
      throw new Error('A service with this name already exists.');
    }
    return result.data;
  }

  private find(id: string): ServiceRecord {
    const service = this.records().find((record) => record.id === id);
    if (!service) throw new Error('This service no longer exists.');
    return service;
  }

  private replace(id: string, service: ServiceRecord): void {
    this.records.update((records) =>
      records.map((record) => (record.id === id ? service : record)),
    );
  }
}

export const SERVICES_CATALOG = new InjectionToken<ServicesCatalog>(
  'Services catalog',
  {
    providedIn: 'root',
    factory: () =>
      new SessionServicesCatalog({
        companyAdmin: false,
        permissions: [],
        currency: 'USD',
      }),
  },
);
