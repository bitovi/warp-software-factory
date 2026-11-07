import { ChangeDetectionStrategy, Component } from '@angular/core';
import { StatusPage } from '@wsf/web/feature-status';

@Component({
  selector: 'wsf-root',
  imports: [StatusPage],
  template: '<wsf-status-page />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
