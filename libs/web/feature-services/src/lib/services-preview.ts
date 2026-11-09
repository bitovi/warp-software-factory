import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  SERVICES_CATALOG,
  SessionServicesCatalog,
} from '@wsf/web/data-access-services';
import { ServicesPage } from './services-page';

@Component({
  selector: 'wsf-services-preview',
  imports: [ServicesPage],
  providers: [
    {
      provide: SERVICES_CATALOG,
      useFactory: () =>
        new SessionServicesCatalog(
          { companyAdmin: true, permissions: ['rates:view'], currency: 'USD' },
          [
            {
              id: 'consulting',
              name: 'Consulting',
              color: '#2563eb',
              defaultRateMinor: 15000,
              billable: true,
              status: 'active',
              usageCount: 1,
            },
            {
              id: 'design',
              name: 'Product design',
              color: '#7c3aed',
              defaultRateMinor: 12500,
              billable: true,
              status: 'active',
              usageCount: 0,
            },
            {
              id: 'internal',
              name: 'Internal work',
              color: '#059669',
              defaultRateMinor: 0,
              billable: false,
              status: 'active',
              usageCount: 0,
            },
            {
              id: 'discovery',
              name: 'Discovery',
              color: '#d97706',
              defaultRateMinor: 10000,
              billable: true,
              status: 'archived',
              usageCount: 0,
            },
          ],
        ),
    },
  ],
  template: `
    <aside
      class="border-b border-amber-200 bg-amber-50 px-5 py-3 text-center text-xs leading-5 text-amber-950"
    >
      <strong class="font-semibold">Session-only preview.</strong>
      Sample company, USD, and admin access. Changes reset on reload. Server
      storage, sign-in, and project/timesheet pickers are not connected.
    </aside>
    <wsf-services-page />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServicesPreview {}
