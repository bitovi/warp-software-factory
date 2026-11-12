import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { AuthStore } from '@wsf/web/data-access-auth';
import { HlmButton } from '@wsf/web/ui';

@Component({
  selector: 'wsf-app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, HlmButton],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell {
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private hasActivated = false;
  protected readonly menuOpen = signal(false);
  protected readonly navigation = [
    { path: '/', label: 'Overview', number: '01' },
    { path: '/projects', label: 'Projects', number: '02' },
    { path: '/services', label: 'Services', number: '03' },
    { path: '/time', label: 'Time entries', number: '04' },
    { path: '/reports', label: 'Reports', number: '05' },
  ];

  constructor() {
    effect(() => {
      if (this.auth.status() === 'anonymous') {
        void this.router.navigate(['/login'], {
          queryParams: { returnUrl: this.router.url },
        });
      }
    });
  }

  protected closeMenu(content: HTMLElement): void {
    if (!this.menuOpen()) return;
    this.menuOpen.set(false);
    content.focus();
  }

  protected focusContent(content: HTMLElement): void {
    if (this.hasActivated) content.focus();
    this.hasActivated = true;
  }
}
