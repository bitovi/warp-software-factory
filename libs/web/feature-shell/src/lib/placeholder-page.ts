import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HlmButton } from '@wsf/web/ui';

@Component({
  selector: 'wsf-placeholder-page',
  imports: [RouterLink, HlmButton],
  template: `
    <div class="mx-auto max-w-5xl">
      <p
        class="mb-3 text-xs font-semibold tracking-widest text-primary uppercase"
      >
        {{ data()['notFound'] ? '404' : 'Feature space' }}
      </p>
      <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">
        {{ data()['heading'] }}
      </h1>
      <p class="mt-4 max-w-xl leading-relaxed text-muted-foreground">
        {{ data()['description'] }}
      </p>
      <section
        class="mt-10 rounded-xl border border-dashed border-border bg-card p-8"
      >
        <h2 class="text-lg font-semibold">
          {{
            data()['notFound']
              ? 'Let’s get you back on track.'
              : 'A place for what comes next.'
          }}
        </h2>
        <p class="mt-2 mb-6 text-sm text-muted-foreground">
          {{
            data()['notFound']
              ? 'Your workspace is still here.'
              : 'This is a placeholder route. Feature functionality is not available yet.'
          }}
        </p>
        <a hlmBtn routerLink="/">Back to overview</a>
      </section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceholderPage {
  private readonly route = inject(ActivatedRoute);
  protected readonly data = toSignal(this.route.data, {
    initialValue: this.route.snapshot.data,
  });
}
