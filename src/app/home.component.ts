import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ReviewInput, ReviewService, BusinessDocument } from './review.service';

interface LanguageOption { id: string; label: string; badge: string; extensions: string[]; }

@Component({
  selector: 'app-home', standalone: true, imports: [FormsModule],
  template: `
    <section class="page home-page">
      <div class="home-intro"><div><div class="eyebrow"><span></span> PYREVIEW WORKSPACE / NEW REVIEW</div><h1>Make the next review<br><em>more intentional.</em></h1></div><p>Give the agent the why behind your code, then choose the fastest way to share what should be reviewed.</p></div>
      <div class="timeline" aria-label="Review setup steps">
        <div class="timeline-rail"><span class="rail-dot active"></span><span class="rail-line"></span><span class="rail-dot" [class.active]="step() === 2"></span></div>
        <div class="timeline-content">
          <section class="step-block" [class.step-complete]="contextReady()">
            <div class="step-heading"><div class="step-number">01</div><div><span class="step-kicker">OPTIONAL CONTEXT</span><h2>Start with the bigger picture</h2><p>Share the requirement, ticket, or visual reference so findings are grounded in what the product should do.</p></div><div class="step-heading-actions"><span class="step-status">{{ contextReady() ? 'ADDED' : 'OPTIONAL' }}</span><button type="button" class="collapse-step" [attr.aria-expanded]="contextExpanded()" (click)="toggleContext()"><i class="material-symbols-outlined">{{ contextExpanded() ? 'expand_less' : 'expand_more' }}</i>{{ contextExpanded() ? 'Collapse' : 'Add context' }}</button></div></div>
            @if (contextExpanded()) { <div class="context-card">
              <div class="context-tabs"><button type="button" [class.selected]="contextType() === 'upload'" (click)="selectContext('upload')"><span>↑</span><b>Upload brief</b><small>Jira export, spec, or notes</small></button><button type="button" [class.selected]="contextType() === 'jira'" (click)="selectContext('jira')"><span>↗</span><b>Jira link</b><small>Keep the ticket close</small></button><button type="button" [class.selected]="contextType() === 'screenshot'" (click)="selectContext('screenshot')"><span>▧</span><b>Screenshot</b><small>Show the intended state</small></button></div>
              @if (contextType() === 'upload') { <button type="button" class="context-drop" (click)="businessDocInput.click()"><input #businessDocInput type="file" accept=".txt,.md,.pdf,.doc,.docx" (change)="onBusinessDocument($event)" hidden><span class="context-symbol">+</span><strong>{{ businessDocuments().length ? 'Add another context file' : 'Choose a context file' }}</strong><small>Jira export, requirements, or product notes</small></button> }
              @if (contextType() === 'jira') { <div class="context-link"><span>↗</span><input [(ngModel)]="jiraUrl" (ngModelChange)="updateJiraContext()" placeholder="https://your-workspace.atlassian.net/browse/PROJ-123"><small>We will attach this reference to the review record.</small></div> }
              @if (contextType() === 'screenshot') { <button type="button" class="context-drop screenshot-drop" (click)="screenshotInput.click()"><input #screenshotInput type="file" accept="image/png,image/jpeg,image/webp" (change)="onScreenshot($event)" hidden><span class="context-symbol">▧</span><strong>{{ screenshotName || 'Choose a screenshot' }}</strong><small>{{ screenshotName ? 'Ready to guide the review' : 'PNG, JPG, or WEBP' }}</small></button> }
              @for (doc of businessDocuments(); track doc.fileName) { <div class="context-file"><span>□</span><strong>{{ doc.fileName }}</strong><select [(ngModel)]="doc.type" aria-label="Context type"><option value="jira">Jira story</option><option value="specification">Specification</option><option value="requirements">Requirements</option><option value="other">Other</option></select><button type="button" (click)="removeBusinessDocument(doc.fileName)" aria-label="Remove context">×</button></div> }
            </div> } @else { <button type="button" class="collapsed-context" (click)="toggleContext()"><i class="material-symbols-outlined">add_circle</i><span><strong>{{ contextReady() ? 'Context attached' : 'No context added' }}</strong><small>{{ contextReady() ? 'Click to review or change the optional context.' : 'Add a Jira link, brief, or screenshot if it helps the reviewer.' }}</small></span><i class="material-symbols-outlined">chevron_right</i></button> }
            <button type="button" class="skip-context" (click)="skipContext()">Skip context <span>↓</span></button>
          </section>

          <section class="step-block review-step" #reviewStep>
            <div class="step-heading"><div class="step-number">02</div><div><span class="step-kicker">CODE TO REVIEW</span><h2>Choose your review surface</h2><p>Paste a snippet, upload a file, or point us to a repository file.</p></div><span class="step-status">READY</span></div>
            <div class="input-card">
        <div class="source-options">
          <button type="button" [class.selected]="source() === 'Paste code'" (click)="select('Paste code')"><span class="option-icon">&lt;/&gt;</span><span><b>Paste code</b><small>Review a snippet</small></span><span class="option-arrow">→</span></button>
          <button type="button" [class.selected]="source() === 'Upload file'" (click)="select('Upload file')"><span class="option-icon">↑</span><span><b>Upload file</b><small>Review a code file</small></span><span class="option-arrow">→</span></button>
          <button type="button" [class.selected]="source() === 'GitHub URL'" (click)="select('GitHub URL')"><span class="option-icon">↗</span><span><b>GitHub URL</b><small>Connect a repository</small></span><span class="option-arrow">→</span></button>
        </div>
        @if (source() === 'Paste code') { <textarea [(ngModel)]="code" (ngModelChange)="onCodeChanged()" placeholder="Paste code in any supported language..." spellcheck="false"></textarea> }
        @if (source() === 'Upload file') { <div class="dropzone" (click)="fileInput.click()"><input #fileInput type="file" accept=".py,.pyw,.js,.jsx,.ts,.tsx,.java,.go,.sql,.json,.html,.css,.txt" (change)="onFile($event)" hidden><div class="upload-icon" [class.loading]="fileLoading()">↑</div>@if (fileLoading()) { <div class="file-loading" aria-live="polite"><span class="loading-spinner"></span> Reading {{ fileName }}</div> } @else { <strong>{{ fileName || 'Drop a code file here' }}</strong><span>{{ fileName ? 'Ready for review' : 'or click to browse from your computer' }}</span> }</div> }
        @if (source() === 'GitHub URL') { <div class="url-input"><span>↗</span><input [(ngModel)]="githubUrl" placeholder="https://github.com/you/repository/blob/main/file.py"></div> }
        <div class="input-footer"><label class="language-picker"><span class="language"><b>{{ selectedLanguage().badge }}</b> {{ selectedLanguage().label }} <span>{{ languageDetected() ? '· detected' : '· selected' }}</span></span><select [ngModel]="languageId()" (ngModelChange)="setLanguage($event)" aria-label="Review language">@for (option of languageOptions; track option.id) { <option [value]="option.id">{{ option.label }}</option> }</select></label><span class="input-hint">{{ source() === 'Paste code' ? 'Ctrl + Enter to review' : 'Ready when you are' }}</span></div>
            </div>
            <div class="action-row">@if (reviewLoading()) { <div class="review-loading" role="status" aria-live="polite"><span class="loading-spinner"></span><span><strong>{{ reviewStage() }}</strong><small>Preparing your review workspace.</small></span></div> } @else { <button class="primary-btn" [disabled]="fileLoading()" (click)="review()">Review my code <span>→</span></button> }<span class="privacy"><span>✦</span> Your code is private and never used to train models</span></div>
          </section>
        </div>
      </div>
      @if (inputError()) { <p class="input-error" role="alert">{{ inputError() }}</p> }
      <div class="home-proof"><span><b>01</b> AST + Ruff checks</span><span><b>02</b> OWASP context</span><span><b>03</b> Actionable fixes</span><span class="privacy"><span>✦</span> Your code stays private</span></div>
    </section>
  `
})
export class HomeComponent {
  private readonly service = inject(ReviewService);
  private readonly router = inject(Router);
  readonly liveEvents = this.service.liveEvents;
  readonly source = signal<ReviewInput>('Paste code');
  readonly fileLoading = signal(false);
  readonly reviewLoading = signal(false);
  readonly reviewStage = signal('Booting the bug radar...');
  readonly inputError = signal('');
  readonly businessDocuments = signal<BusinessDocument[]>([]);
  readonly contextType = signal<'upload' | 'jira' | 'screenshot'>('upload');
  readonly contextExpanded = signal(false);
  readonly languageId = signal('python');
  readonly languageDetected = signal(false);
  readonly languageOptions: LanguageOption[] = [
    { id: 'python', label: 'Python', badge: 'PY', extensions: ['py', 'pyw'] },
    { id: 'javascript', label: 'JavaScript', badge: 'JS', extensions: ['js', 'jsx'] },
    { id: 'typescript', label: 'TypeScript', badge: 'TS', extensions: ['ts', 'tsx'] },
    { id: 'java', label: 'Java', badge: 'JV', extensions: ['java'] },
    { id: 'go', label: 'Go', badge: 'GO', extensions: ['go'] },
    { id: 'sql', label: 'SQL', badge: 'SQL', extensions: ['sql'] },
    { id: 'json', label: 'JSON', badge: '{}', extensions: ['json'] },
    { id: 'html', label: 'HTML', badge: 'HT', extensions: ['html', 'htm'] },
    { id: 'css', label: 'CSS', badge: '#', extensions: ['css'] }
  ];
  readonly step = signal<1 | 2>(1);
  code = '';
  githubUrl = '';
  jiraUrl = '';
  screenshotName = '';
  fileName = '';
  fileCode = '';
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('businessDocInput') businessDocInput?: ElementRef<HTMLInputElement>;
  @ViewChild('screenshotInput') screenshotInput?: ElementRef<HTMLInputElement>;
  @ViewChild('reviewStep') reviewStep?: ElementRef<HTMLElement>;
  readonly loadingWorkflowNodes = [
    { id: 'orchestrator', label: 'Orchestrator', icon: 'account_tree' },
    { id: 'github_mcp', label: 'GitHub MCP', icon: 'hub' },
    { id: 'deterministic_ast', label: 'Deterministic AST', icon: 'code' },
    { id: 'ruff', label: 'Ruff', icon: 'rule' },
    { id: 'rag', label: 'Tool call: RAG', icon: 'database_search' },
    { id: 'owasp', label: 'OWASP tool', icon: 'shield' },
    { id: 'llm_model', label: 'LLM model', icon: 'psychology' },
    { id: 'pull_request', label: 'PR review ready', icon: 'publish' }
  ];

  selectedLanguage(): LanguageOption { return this.languageOptions.find(option => option.id === this.languageId()) ?? this.languageOptions[0]; }
  setLanguage(language: string): void { this.languageId.set(language); this.languageDetected.set(false); }

  loadingStageStatus(stageId: string): 'pending' | 'running' | 'completed' {
    const events = this.liveEvents();
    const stageEvents = this.loadingStageEvents(stageId, events);
    const completed = this.loadingStageCompleted(stageId, events);
    if (completed) return 'completed';
    if (stageEvents.length > 0) return 'running';
    return 'pending';
  }

  loadingStageLabel(stageId: string): string {
    const status = this.loadingStageStatus(stageId);
    return status === 'completed' ? 'complete' : status === 'running' ? 'in progress' : 'waiting';
  }

  loadingProgress(): number {
    const completed = this.loadingWorkflowNodes.filter(node => this.loadingStageStatus(node.id) === 'completed').length;
    const running = this.loadingWorkflowNodes.some(node => this.loadingStageStatus(node.id) === 'running') ? 0.5 : 0;
    return ((completed + running) / this.loadingWorkflowNodes.length) * 100;
  }

  onCodeChanged(): void {
    const detected = this.detectLanguage(this.code);
    if (detected) {
      this.languageId.set(detected);
      this.languageDetected.set(true);
    }
  }

  contextReady(): boolean { return this.businessDocuments().length > 0 || !!this.jiraUrl.trim() || !!this.screenshotName; }

  selectContext(type: 'upload' | 'jira' | 'screenshot'): void {
    this.contextType.set(type);
    this.inputError.set('');
  }

  toggleContext(): void { this.contextExpanded.update(expanded => !expanded); }

  skipContext(): void {
    this.contextExpanded.set(false);
    this.step.set(2);
    setTimeout(() => this.reviewStep?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  updateJiraContext(): void {
    const existing = this.businessDocuments().filter(doc => doc.fileName !== 'Jira reference');
    if (this.jiraUrl.trim()) existing.push({ fileName: 'Jira reference', content: this.jiraUrl.trim(), type: 'jira', uploadedAt: new Date().toISOString() });
    this.businessDocuments.set(existing);
  }

  select(value: ReviewInput): void {
    this.source.set(value);
    this.inputError.set('');
  }

  onFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.inputError.set('');
    this.fileName = file.name;
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const fileLanguage = this.languageOptions.find(option => option.extensions.includes(extension));
    if (fileLanguage) { this.languageId.set(fileLanguage.id); this.languageDetected.set(true); }
    this.fileLoading.set(true);
    const reader = new FileReader();
    reader.onload = () => (this.fileCode = String(reader.result));
    reader.onloadend = () => this.fileLoading.set(false);
    reader.onerror = () => {
      this.fileCode = '';
      this.inputError.set('This file could not be read.');
    };
    reader.readAsText(file);
  }

  onBusinessDocument(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result);
      const businessDoc: BusinessDocument = {
        fileName: file.name,
        content: content,
        type: 'other',
        uploadedAt: new Date().toISOString()
      };
      this.businessDocuments.update(docs => [...docs, businessDoc]);
    };
    reader.onerror = () => {
      this.inputError.set(`Could not read business document: ${file.name}`);
    };
    reader.readAsText(file);
  }

  onScreenshot(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.screenshotName = file.name;
    const reader = new FileReader();
    reader.onload = () => this.businessDocuments.update(docs => [...docs.filter(doc => doc.type !== 'other'), { fileName: file.name, content: String(reader.result), type: 'other', uploadedAt: new Date().toISOString() }]);
    reader.readAsDataURL(file);
  }

  removeBusinessDocument(fileName: string): void {
    this.businessDocuments.update(docs => docs.filter(doc => doc.fileName !== fileName));
  }

  review(): void {
    const code = this.source() === 'Paste code' ? this.code : this.source() === 'Upload file' ? this.fileCode : this.githubUrl;
    if (this.fileLoading() || this.reviewLoading()) return;
    if (!code.trim()) {
      this.inputError.set(this.source() === 'GitHub URL' ? 'Enter a valid GitHub URL before starting the review.' : 'Add some Python code before starting the review.');
      return;
    }

    let targetName = this.fileName;
    if (this.source() === 'GitHub URL') {
      const urlParts = this.githubUrl.trim().split('/');
      const lastPart = urlParts[urlParts.length - 1] || 'github-source.py';
      targetName = lastPart.includes('.') ? lastPart : `${lastPart}.py`;
    } else if (!targetName) {
      targetName = `pasted-snippet.${this.selectedLanguage().extensions[0]}`;
    }

    this.reviewLoading.set(true);
    this.step.set(2);
    this.reviewStage.set('Launching the code-review mothership...');
    this.service.submit(this.source(), targetName, code, this.languageId(), this.businessDocuments(), reviewId => this.router.navigate(['/review', reviewId])).subscribe({
      next: review => this.router.navigate(['/review', review.id]),
      error: (err) => {
        this.reviewLoading.set(false);
        this.inputError.set(err?.error?.detail || err?.message || 'The review API could not be reached. Start the backend and try again.');
      }
    });
  }

  private detectLanguage(source: string): string | null {
    const code = source.trim();
    if (!code) return null;
    if (/^(\{|\[)\s*["']/.test(code) && /["']\s*:/.test(code)) return 'json';
    if (/<(!doctype\s+html|html|div|body|head)\b/i.test(code)) return 'html';
    if (/^(select|insert\s+into|update\s+\w+\s+set|delete\s+from|create\s+table)\b/i.test(code)) return 'sql';
    if (/^\s*package\s+\w+|\bfunc\s+\w+\s*\(/m.test(code)) return 'go';
    if (/\b(public|private|protected)\s+(static\s+)?(class|void|int|String)\b|System\.out\.print/.test(code)) return 'java';
    if (/\b(interface|type)\s+\w+\s*[={<]|:\s*(string|number|boolean)\b/.test(code)) return 'typescript';
    if (/\b(const|let|var)\s+\w+\s*=|console\.log|=>|function\s+\w+/.test(code)) return 'javascript';
    if (/^\s*(from\s+\w+\s+import|import\s+\w+|def\s+\w+\s*\(|class\s+\w+.*:)|\b(None|True|False|print)\b/m.test(code)) return 'python';
    if (/^[^{]+\{[^}]*[;:]\s*[^}]*\}/s.test(code)) return 'css';
    return null;
  }

  private loadingStageEvents(stageId: string, events: Array<{ node: string; event: string }>): Array<{ node: string; event: string }> {
    return events.filter(event => {
      if (stageId === 'orchestrator') return event.node === 'orchestrator' || event.node === 'model_armor';
      if (stageId === 'github_mcp') return event.node === 'github_mcp';
      if (stageId === 'deterministic_ast') return event.node === 'static_analysis' || event.node === 'deterministic_gate' || event.event.includes('python_ast_scanner');
      if (stageId === 'ruff') return event.node === 'ruff';
      if (stageId === 'rag') return event.node === 'rag';
      if (stageId === 'owasp') return event.node === 'owasp' || event.event.includes('owasp_context');
      if (stageId === 'llm_model') return event.node === 'agent_reasoner' || event.node === 'review_reasoner';
      if (stageId === 'pull_request') return event.node === 'pull_request' || event.node === 'memory';
      return false;
    });
  }

  private loadingStageCompleted(stageId: string, events: Array<{ node: string; event: string }>): boolean {
    if (stageId === 'orchestrator') return events.some(event => event.node === 'orchestrator' && event.event === 'pipeline_completed');
    if (stageId === 'github_mcp') return events.some(event => event.node === 'github_mcp');
    if (stageId === 'deterministic_ast') return events.some(event => event.node === 'static_analysis' && event.event === 'ast_completed') || events.some(event => event.node === 'deterministic_gate' && event.event === 'passed');
    if (stageId === 'ruff') return events.some(event => event.node === 'ruff' && ['scan_completed', 'scan_skipped'].includes(event.event));
    if (stageId === 'rag') return events.some(event => event.node === 'rag' && event.event === 'retrieval_completed');
    if (stageId === 'owasp') return events.some(event => event.node === 'owasp' && event.event === 'lookup_completed') || events.some(event => event.event === 'owasp_context_loaded');
    if (stageId === 'llm_model') return events.some(event => event.node === 'agent_reasoner' && event.event === 'reasoning_completed');
    if (stageId === 'pull_request') return events.some(event => event.node === 'pull_request' && event.event === 'review_ready');
    return false;
  }
}
