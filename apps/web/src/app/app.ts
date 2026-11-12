import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ProjectsPage } from '@wsf/web/feature-projects';

@Component({
  selector: 'wsf-root',
  imports: [ProjectsPage],
  template: '<wsf-projects-page />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
