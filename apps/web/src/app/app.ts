import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { StatusPage } from '@wsf/web/feature-status';
import { ServicesPreview } from '@wsf/web/feature-services';

@Component({
  selector: 'wsf-root',
  imports: [StatusPage, ServicesPreview],
  template: `
    <header class="border-b border-border bg-white">
      <nav
        aria-label="Main navigation"
        class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8"
      >
        <span class="text-sm font-bold tracking-tight"
          >WSF
          <span class="ml-2 font-normal text-slate-400">/ Workspace</span></span
        >
        <div class="flex gap-2 text-sm">
          <button
            type="button"
            class="rounded-md px-3 py-2 font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-ring"
            [attr.aria-current]="page() === 'services' ? 'page' : null"
            (click)="page.set('services')"
          >
            Services
          </button>
          <button
            type="button"
            class="rounded-md px-3 py-2 font-medium text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-ring"
            [attr.aria-current]="page() === 'status' ? 'page' : null"
            (click)="page.set('status')"
          >
            Workspace status
          </button>
        </div>
      </nav>
    </header>
    <wsf-services-preview [hidden]="page() !== 'services'" />
    @if (page() === 'status') {
      <wsf-status-page />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly page = signal('services');
}
