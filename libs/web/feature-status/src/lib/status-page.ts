import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HealthStore } from '@wsf/web/data-access-status';
import { TasksPage } from '@wsf/web/feature-tasks';
import { HlmButton } from '@wsf/web/ui';

@Component({
  selector: 'wsf-status-page',
  imports: [HlmButton, RouterLink, TasksPage],
  providers: [HealthStore],
  templateUrl: './status-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusPage {
  protected readonly store = inject(HealthStore);

  constructor() {
    this.store.load();
  }
}
