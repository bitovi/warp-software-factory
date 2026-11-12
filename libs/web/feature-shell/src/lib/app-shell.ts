import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { HlmButton } from '@wsf/web/ui';

@Component({
  selector: 'wsf-app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, HlmButton],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell {
  private hasActivated = false;
  protected readonly menuOpen = signal(false);
  protected readonly navigation = [
    { path: '/', label: 'Overview', number: '01' },
    { path: '/projects', label: 'Projects', number: '02' },
    { path: '/services', label: 'Services', number: '03' },
    { path: '/time', label: 'Time entries', number: '04' },
    { path: '/reports', label: 'Reports', number: '05' },
  ];

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
