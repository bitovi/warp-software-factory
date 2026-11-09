import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ReportsWorkspace } from '@wsf/web/feature-reports';

@Component({
  selector: 'wsf-root',
  imports: [ReportsWorkspace],
  template: '<wsf-reports-workspace />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
