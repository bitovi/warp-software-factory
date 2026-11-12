import { ChangeDetectionStrategy, Component } from '@angular/core';
import { StatusPage } from '@wsf/web/feature-status';
import { TasksPage } from '@wsf/web/feature-tasks';

@Component({
  selector: 'wsf-root',
  imports: [StatusPage, TasksPage],
  template: '<wsf-status-page /><wsf-tasks-page />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
