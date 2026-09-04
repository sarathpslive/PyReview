import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ReviewInput, ReviewService } from './review.service';

@Component({
  selector: 'app-home', standalone: true, imports: [FormsModule],
  template: `
    <section class="page home-page">
      @if (reviewLoading()) { <div class="review-overlay" role="dialog" aria-modal="true" aria-label="Review in progress"><div class="review-modal"><div class="scan-ring"><span></span></div><span class="modal-kicker">MISSION CONTROL / PYREVIEW</span><strong>{{ reviewStage() }}</strong><p>We are doing huge things to your code. Please remain dramatically calm.</p><div class="scan-progress"><span></span></div><small>Analyzing source // calibrating cleverness // 5 sec</small></div></div> }
      <div class="eyebrow">AI-POWERED CODE REVIEW <span></span> 01 / 03</div>
      <div class="hero-heading"><div><h1>Intelligent reviews.<br><em>Seamless delivery.</em></h1></div><p><strong>Your Agentic AI pair reviewer for Python.</strong><br><br>Get a second pair of eyes before your code meets production. Fast, precise feedback from an AI that understands how developers think.</p></div>
      <div class="input-card">
        <div class="source-options">
          <button type="button" [class.selected]="source() === 'Paste code'" (click)="select('Paste code')"><span class="option-icon">&lt;/&gt;</span><span><b>Paste code</b><small>Review a snippet</small></span><span class="option-arrow">→</span></button>
          <button type="button" [class.selected]="source() === 'Upload file'" (click)="select('Upload file')"><span class="option-icon">↑</span><span><b>Upload file</b><small>Review a Python file</small></span><span class="option-arrow">→</span></button>
          <button type="button" [class.selected]="source() === 'GitHub URL'" (click)="select('GitHub URL')"><span class="option-icon">↗</span><span><b>GitHub URL</b><small>Connect a repository</small></span><span class="option-arrow">→</span></button>
        </div>
        @if (source() === 'Paste code') { <textarea [(ngModel)]="code" placeholder="Paste your Python code here..." spellcheck="false"></textarea> }
        @if (source() === 'Upload file') { <div class="dropzone" (click)="fileInput.click()"><input #fileInput type="file" accept=".py,.pyw,.txt" (change)="onFile($event)" hidden><div class="upload-icon" [class.loading]="fileLoading()">↑</div>@if (fileLoading()) { <div class="file-loading" aria-live="polite"><span class="loading-spinner"></span> Reading {{ fileName }}</div> } @else { <strong>{{ fileName || 'Drop a Python file here' }}</strong><span>{{ fileName ? 'Ready for review' : 'or click to browse from your computer' }}</span> }</div> }
        @if (source() === 'GitHub URL') { <div class="url-input"><span>↗</span><input [(ngModel)]="githubUrl" placeholder="https://github.com/you/repository/blob/main/file.py"></div> }
        <div class="input-footer"><span class="language"><b>PY</b> Python 3.12 <span>⌄</span></span><span class="input-hint">{{ source() === 'Paste code' ? 'Ctrl + Enter to review' : 'Ready when you are' }}</span></div>
      </div>
      <div class="action-row">@if (reviewLoading()) { <div class="review-loading" role="status" aria-live="polite"><span class="loading-spinner"></span><span><strong>{{ reviewStage() }}</strong><small>Do not panic. The semicolons are being questioned.</small></span></div> } @else { <button class="primary-btn" [disabled]="fileLoading()" (click)="review()">Review my code <span>→</span></button> }<span class="privacy"><span>✦</span> Your code is private and never used to train models</span></div>
      @if (inputError()) { <p class="input-error" role="alert">{{ inputError() }}</p> }
      <div class="feature-strip"><div><strong>01</strong><span><b>Inline feedback</b>Every finding, right where it matters.</span></div><div><strong>02</strong><span><b>Severity that speaks</b>Know what to fix first.</span></div><div><strong>03</strong><span><b>Learn as you go</b>Clear explanations, no gatekeeping.</span></div></div>
    </section>
  `
})
export class HomeComponent {
  private readonly service = inject(ReviewService); private readonly router = inject(Router);
  readonly source = signal<ReviewInput>('Paste code'); readonly fileLoading = signal(false); readonly reviewLoading = signal(false); readonly reviewStage = signal('Booting the bug radar...'); readonly inputError = signal(''); code = ''; githubUrl = ''; fileName = ''; fileCode = '';
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;
  select(value: ReviewInput): void { this.source.set(value); this.inputError.set(''); }
  onFile(event: Event): void { const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return; this.inputError.set(''); this.fileName = file.name; this.fileLoading.set(true); const reader = new FileReader(); reader.onload = () => this.fileCode = String(reader.result); reader.onloadend = () => this.fileLoading.set(false); reader.onerror = () => { this.fileCode = ''; this.inputError.set('This file could not be read.'); }; reader.readAsText(file); }
  async review(): Promise<void> { const code = this.source() === 'Paste code' ? this.code : this.source() === 'Upload file' ? this.fileCode : this.githubUrl; if (this.fileLoading() || this.reviewLoading()) return; if (!code.trim()) { this.inputError.set('Add some Python code before starting the review.'); return; } if (this.source() === 'GitHub URL') { this.inputError.set('GitHub review will be available when the API is connected. Upload or paste the code for now.'); return; } this.inputError.set(''); this.reviewLoading.set(true); this.reviewStage.set('Creating a live review channel...'); try { const id = await this.service.startReview(this.source(), this.fileName || 'pasted-snippet.py', code); this.router.navigate(['/events', id]); } catch { this.inputError.set('The review service could not be reached. Start the backend on port 8000 and try again.'); this.reviewLoading.set(false); } }
}
