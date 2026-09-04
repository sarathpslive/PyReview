import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="topbar">
      <a class="brand" routerLink="/"><span class="brand-copy"><strong>PyReview | Agent</strong><small>by PyNgineers</small></span></a>
      <nav><a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">New review</a><a routerLink="/history" routerLinkActive="active">History</a><a routerLink="/events" routerLinkActive="active">Activity</a></nav>
      <div class="topbar-tools"><button class="theme-toggle" type="button" [attr.aria-label]="'Switch to ' + nextTheme() + ' theme'" (click)="cycleTheme()"><span>◐</span> {{ theme() | titlecase }}</button><div class="status"><span class="status-dot"></span> API connected</div></div>
    </header>
    <main><router-outlet /></main>
    <footer><span>PYREVIEW / REVIEW ENGINE</span><span>Built for thoughtful code</span></footer>
  `
})
export class AppComponent {
  readonly theme = signal<'light' | 'dark' | 'color'>('light');
  private readonly themes: Array<'light' | 'dark' | 'color'> = ['light', 'dark', 'color'];

  constructor() {
    document.body.dataset['theme'] = this.theme();
  }

  nextTheme(): string { return this.themes[(this.themes.indexOf(this.theme()) + 1) % this.themes.length]; }
  cycleTheme(): void {
    const next = this.nextTheme() as 'light' | 'dark' | 'color';
    this.theme.set(next);
    document.body.dataset['theme'] = next;
  }
}
