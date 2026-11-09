import { ChangeDetectionStrategy, Component } from '@angular/core';
import { StatusPage } from '@wsf/web/feature-status';
import { TimesheetPage } from '@wsf/web/feature-timesheet';

@Component({
  selector: 'wsf-root',
  imports: [StatusPage, TimesheetPage],
  template: `<wsf-timesheet-page />
    <details class="mx-auto max-w-6xl px-7 pb-8">
      <summary class="cursor-pointer text-sm text-slate-600">
        Workspace foundation status
      </summary>
      <wsf-status-page />
    </details>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
