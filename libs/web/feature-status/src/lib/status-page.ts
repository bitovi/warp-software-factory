import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { StatusClient } from '@wsf/web/data-access-status';
import { HlmButton } from '@wsf/web/ui';
import { finalize } from 'rxjs';

@Component({
  selector: 'wsf-status-page',
  imports: [HlmButton],
  templateUrl: './status-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusPage {
  private readonly client = inject(StatusClient);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly loading = signal(false);
  protected readonly status = signal('Not checked');

  protected checkApi(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.status.set('Checking…');
    this.client
      .getStatus()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (response) =>
          this.status.set(`${response.service} · ${response.status}`),
        error: () =>
          this.status.set(
            'API unavailable or response invalid. Start nx serve api and retry.',
          ),
      });
  }
}
