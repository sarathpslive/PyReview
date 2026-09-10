import { Component, computed, inject, signal, OnDestroy, ViewChild, ElementRef, effect } from '@angular/core';
import { SlicePipe, DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReviewService, Severity, InlineComment, ReviewFile } from './review.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

type WorkflowStatus = 'pending' | 'running' | 'completed';
interface WorkflowNode {
  id: string;
  label: string;
  detail: string;
  icon: string;
}
interface GuidanceCard {
  severity: string;
  line: number | null;
  body: string;
  blocking: boolean | null;
  codeLine: string;
  replacement: string;
}

@Component({
  selector: 'app-review', standalone: true, imports: [RouterLink, SlicePipe, DatePipe],
  template: `
    @if (review(); as item) {
      <section class="page review-page">
        <div class="eyebrow">REVIEW COMPLETE <span></span> {{ item.comments.length }} / 03</div>
        <div class="review-header">
          <div>
            <a routerLink="/" class="back">← New review</a>
            <h1>{{ item.name }}</h1>
            <div class="meta">
              <span class="python-badge">{{ item.language.slice(0, 2).toUpperCase() }}</span> {{ item.language }} <span>·</span> {{ item.source }} <span>·</span> {{ item.time }} <span>·</span> ID {{ item.id }}
              @if (item.prUrl) {
                <span>·</span>
                <a [href]="item.prUrl" target="_blank" rel="noopener noreferrer" class="pr-link-badge">
                  <i class="material-symbols-outlined pr-icon" style="font-size:13px; vertical-align:middle;">open_in_new</i> View PR #{{ item.prNumber || '' }} on GitHub
                </a>
              }
            </div>
          </div>
          <div class="severity-summary" aria-label="Review severity counts"><span class="severity-summary-label">FINDINGS BY SEVERITY</span><strong>{{ item.findings }} findings</strong><div class="review-counts"><b class="count-critical">{{ item.criticalFindings }} C</b><b class="count-high">{{ item.highFindings }} H</b><b class="count-medium">{{ item.mediumFindings }} M</b><b class="count-low">{{ item.lowFindings }} L</b><b class="count-suggestion">{{ item.suggestions }} S</b></div></div>
        </div>

        <div class="summary-banner">
          @if (item.prUrl) {
            <div class="pr-banner">
              <div class="pr-banner-info">
                <i class="material-symbols-outlined" style="font-size:18px; color:#315efb; vertical-align:middle;">call_merge</i>
                <span><strong>Pull Request #{{ item.prNumber }}</strong> scan completed</span>
              </div>
              <a [href]="item.prUrl" target="_blank" rel="noopener noreferrer" class="pr-banner-btn">
                Open PR on GitHub ↗
              </a>
            </div>
          }
          <strong>Review summary</strong>
          <p>{{ item.summary ?? 'The review flagged a few high-priority issues that deserve attention before shipping.' }}</p>
          <div class="summary-tags">
            @for (tag of item.owaspContext ?? []; track tag) {
              <span>{{ tag }}</span>
            }
          </div>
        </div>

        <section class="dag-panel">
          <div class="dag-heading"><div><span class="panel-kicker">LIVE ORCHESTRATION</span><h2>Review execution</h2><p>Each stage begins after the preceding stage completes.</p></div><span>{{ workflowEvents(item).length }} events</span></div>
          <div class="workflow-legend"><span><i class="legend-running"></i>active</span><span><i class="legend-complete"></i>complete</span><span><i class="legend-pending"></i>waiting</span></div>
          <div class="workflow-lane" #workflowLane role="list" aria-label="Sequential agentic review workflow">
            @for (node of workflowNodes; track node.id) {
              <button class="workflow-node" [class]="workflowStatus(node.id, workflowEvents(item))" [class.selected]="selectedWorkflowNode() === node.id" [disabled]="workflowStatus(node.id, workflowEvents(item)) === 'pending'" [attr.aria-label]="node.label + ': ' + workflowStatus(node.id, workflowEvents(item))" (click)="selectedWorkflowNode.set(selectedWorkflowNode() === node.id ? '' : node.id)">
                <i class="material-symbols-outlined workflow-icon">{{ node.icon }}</i><b>{{ node.label }}</b><span class="workflow-tooltip"><strong>{{ node.detail }}</strong><small>{{ latestEvent(node.id, workflowEvents(item)) }}</small><em>{{ statusLabel(workflowStatus(node.id, workflowEvents(item))) }}</em></span>
              </button>
              @if (!$last) { <span class="workflow-connector" [class.active]="workflowStatus(node.id, workflowEvents(item)) === 'completed'" [class.flowing]="workflowStatus(node.id, workflowEvents(item)) === 'running'"><i></i></span> }
            }
          </div>
          <div class="workflow-log" [class.expanded]="workflowLogExpanded()">
            <button type="button" class="workflow-log-toggle" [attr.aria-expanded]="workflowLogExpanded()" (click)="toggleWorkflowLog()"><span><i class="material-symbols-outlined">terminal</i> LIVE EVENT LOG</span><b>{{ workflowLogExpanded() ? 'Hide details' : 'Show details' }} <i class="material-symbols-outlined">{{ workflowLogExpanded() ? 'expand_less' : 'expand_more' }}</i></b></button>
            @if (workflowLogExpanded()) { <div class="workflow-log-body"><div class="workflow-log-head"><span>EVENT STREAM</span><button type="button" (click)="selectedWorkflowNode.set('')">All events</button></div>@for (event of visibleWorkflowEvents(item); track $index) { <div class="workflow-log-row"><time>{{ event.timestamp | slice:11:19 }}</time><b>{{ event.node.replaceAll('_', ' ') }}</b><span>{{ event.event.replaceAll('_', ' ') }}</span></div> }</div> }
          </div>
        </section>

        <div class="review-grid">
          <div class="code-panel">
            <div class="panel-top">
              <span>source / {{ currentFileName() }}</span>
              <span>{{ currentCode().split('\n').length }} lines <button title="Copy code">⧉</button></span>
            </div>
            @if (item.files && item.files.length > 1) {
              <div class="file-tabs-bar">
                @for (f of item.files; track f.path) {
                  <button type="button" class="file-tab-btn" [class.active]="currentFilePath() === f.path" (click)="selectFile(f.path)">
                    <i class="material-symbols-outlined" style="font-size:14px">description</i>
                    <span class="tab-label">{{ f.path }}</span>
                    @if (fileIssueCount(f.path); as cnt) {
                      <b class="tab-badge">{{ cnt }}</b>
                    }
                  </button>
                }
              </div>
            }
            <div class="code-view">
              @for (line of currentCode().split('\n'); track $index) {
                <div class="code-line" [class.has-comment]="commentFor($index + 1)" [class.secret-line]="isSecret(commentFor($index + 1))">
                  <span class="line-no">{{ ($index + 1).toString().padStart(2, '0') }}</span>
                  @if (commentFor($index + 1); as note) {
                    @let parts = codeParts(line || ' ', note);
                    <code>{{ parts.before }}@if (parts.match) {<mark class="evidence-highlight" [class.secret-highlight]="isSecret(note)">{{ parts.match }}</mark>}{{ parts.after }}</code>
                    <button class="marker" [class]="note.severity" [class.active]="selectedFinding()?.line === note.line" [attr.aria-label]="'Show details for line ' + note.line" (click)="selectFinding(note); $event.stopPropagation()">{{ marker(note.severity) }}</button>
                  } @else { <code>{{ line || ' ' }}</code> }
                </div>
                @if (selectedFinding()?.line === $index + 1) {
                  <div class="issue-popover">
                    <div class="popover-heading"><span class="severity-label">{{ severityLabel(selectedFinding()!.severity) }}</span><button title="Close details" (click)="selectedFinding.set(null)">×</button></div>
                    <strong>{{ selectedFinding()!.title }}</strong>
                    <p>{{ selectedFinding()!.body }}</p>
                    <span class="popover-action">Suggested replacement is shown below ↓</span>
                  </div>
                }
              }
            </div>
          </div>

          <aside class="findings">
            <div class="findings-head">
              <div><span class="panel-kicker">AI FINDINGS</span><h2>{{ item.findings }} things worth a look</h2></div>
              <button class="filter">All <span>⌄</span></button>
            </div>
            @for (note of item.comments; track $index) {
              <article class="finding" [class]="note.severity" [class.selected]="selectedFinding() === note" (click)="selectFinding(note)">
                <div class="finding-line">
                  <span class="severity-dot"></span>
                  <span class="severity-label">{{ severityLabel(note.severity) }}</span>
                  @if (note.path) {
                    <span class="path-badge">{{ note.path }}</span>
                  }
                  <span class="line-label">line {{ note.line }}</span>
                </div>
                <h3>{{ note.title }}</h3>
                <p>{{ note.body }}</p>
              </article>
            }
          </aside>
        </div>

        @if (selectedFinding(); as note) {
          <section class="comparison-panel">
            <div class="comparison-header"><div><span class="panel-kicker">SUGGESTED CHANGE</span><h2>{{ note.title }}</h2></div><span>{{ note.path ? note.path + ' : ' : '' }}line {{ note.line }}</span></div>
            <div class="comparison-grid">
              <div class="comparison-pane removed"><div class="comparison-label"><span>−</span> Current code</div><pre>{{ sourceLine(item.code, note.line) }}</pre></div>
              <div class="comparison-pane added"><div class="comparison-label"><span>+</span> Suggested replacement</div><pre>{{ note.replacement || 'No replacement snippet provided.' }}</pre></div>
            </div>
          </section>
        }

        <section class="senior-guidance">
          <div><span class="panel-kicker">SENIOR DEVELOPER GUIDANCE</span><h2>Recommended next actions</h2></div>
          <ol class="guidance-list">
            @for (recommendation of item.recommendations; track recommendation) {
              @let guidance = recommendationDetails(item, recommendation);
              <li class="guidance-item" [class.code-suggestion]="guidance.codeLine && guidance.replacement" [class]="guidance.severity.toLowerCase()">
                <div class="guidance-meta"><span class="guidance-severity">{{ guidance.severity }}</span>@if (guidance.line) { <span>line {{ guidance.line }}</span> } @if (guidance.blocking !== null) { <span class="guidance-blocking">{{ guidance.blocking ? 'PR blocking' : 'Suggested' }}</span> }</div>
                <p>{{ guidance.body }}</p>
                @if (guidance.codeLine && guidance.replacement) { <div class="guidance-diff"><div class="guidance-diff-line removed"><span>−</span><code>{{ guidance.codeLine }}</code></div><div class="guidance-diff-line added"><span>+</span><code>{{ guidance.replacement }}</code></div></div> }
              </li>
            }
            @empty { <li class="guidance-item"><p>Apply the suggested replacement, add a regression test, and rerun the review before merge.</p></li> }
          </ol>
          @if (item.owaspFindings.length) { <div class="owasp-links"><div class="owasp-heading"><i class="material-symbols-outlined">shield_lock</i><div><span>SECURITY REFERENCES</span><strong>OWASP TOOL RESULTS</strong><small>Prioritized guidance from the OWASP Top 10 knowledge base.</small></div><b>{{ item.owaspFindings.length }} {{ item.owaspFindings.length === 1 ? 'category' : 'categories' }}</b></div><div class="owasp-card-grid">@for (finding of item.owaspFindings; track finding.category) { <a [href]="finding.url" target="_blank" rel="noopener"><span class="owasp-card-top"><i class="material-symbols-outlined">open_in_new</i><b>{{ finding.category }}</b></span><small>{{ finding.importance }}</small></a> }</div></div> }
        </section>

        @if (item.businessLogicFindings?.length) {
          <section class="business-logic-panel">
            <div class="business-logic-header"><span class="panel-kicker">BUSINESS LOGIC ALIGNMENT</span><h2>Requirements analysis</h2></div>
            <div class="business-logic-list">
              @for (finding of item.businessLogicFindings; track finding.issue) {
                <article class="business-finding" [class]="finding.severity">
                  <div class="finding-header">
                    <span class="severity-badge">{{ finding.severity.toUpperCase() }}</span>
                    <strong>{{ finding.issue }}</strong>
                  </div>
                  <div class="finding-details">
                    <p><strong>Context:</strong> {{ finding.context }}</p>
                    <p><strong>Impact:</strong> {{ finding.alignment }}</p>
                  </div>
                </article>
              }
            </div>
          </section>
        }

        @if (item.businessDocuments?.length) {
          <section class="business-documents-panel">
            <div class="business-docs-header"><span class="panel-kicker">BUSINESS CONTEXT</span><h2>Uploaded documents</h2></div>
            <div class="business-docs-list">
              @for (doc of item.businessDocuments; track doc.fileName) {
                <div class="doc-preview">
                  <span class="doc-type-badge">{{ doc.type }}</span>
                  <strong>{{ doc.fileName }}</strong>
                  <small>{{ doc.uploadedAt | date: 'short' }}</small>
                </div>
              }
            </div>
          </section>
        }

        <div class="feedback">
          <span>Help improve the agent</span>
          <button [class.chosen]="feedback() === 'helpful'" (click)="feedback.set('helpful'); feedbackSent.set(false)">Helpful</button>
          <button [class.chosen]="feedback() === 'needs_work'" (click)="feedback.set('needs_work'); feedbackSent.set(false)">Needs work</button>
          @if (feedback() && !feedbackSent()) { <input #feedbackComment placeholder="What should the next review improve?" (keyup.enter)="sendFeedback(item.id, feedbackComment.value)"><button class="feedback-send" (click)="sendFeedback(item.id, feedbackComment.value)">Send feedback</button> }
          @if (feedbackSent()) { <em>Feedback recorded for future review improvements.</em> }
        </div>
      </section>
    } @else if (isLoading()) {
      <section class="page review-execution-page" aria-live="polite">
        <div class="review-execution-heading"><div><a routerLink="/" class="back">← New review</a><span class="panel-kicker">PYREVIEW / LIVE ORCHESTRATION</span><h1>Review execution</h1><p>{{ loadingStageText() }}</p></div><span class="loading-event-count">{{ service.liveEvents().length }} events</span></div>
        <div class="loading-progress-rule"><span [style.width.%]="loadingProgress()"></span></div>
        <div class="loading-workflow review-route-workflow" role="list">@for (node of workflowNodes; track node.id; let last = $last) { <div class="loading-stage" [class]="workflowStatus(node.id, workflowEventsForLoading())" role="listitem"><i class="material-symbols-outlined">{{ node.icon }}</i><b>{{ node.label }}</b><small>{{ statusLabel(workflowStatus(node.id, workflowEventsForLoading())) }}</small></div>@if (!last) { <span class="loading-connector" [class.completed]="workflowStatus(node.id, workflowEventsForLoading()) === 'completed'"></span> } }</div>
        <div class="loading-current"><i class="material-symbols-outlined">sync</i><span>Working through the review pipeline</span></div>
      </section>
    } @else {
      <section class="page empty-state"><h1>No review yet.</h1><a routerLink="/">Start a new review →</a></section>
    }
  `
})
export class ReviewComponent implements OnDestroy {
  readonly service = inject(ReviewService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();
  readonly review = this.service.current;
  readonly isLoading = computed(() => this.service.activeReviewId() === this.route.snapshot.paramMap.get('id'));
  readonly feedback = signal<'helpful' | 'needs_work' | ''>('');
  readonly feedbackSent = signal(false);
  readonly selectedFinding = signal<InlineComment | null>(null);
  readonly selectedWorkflowNode = signal('');
  readonly workflowLogExpanded = signal(false);
  readonly activeFilePath = signal<string>('');
  readonly workflowNodes: WorkflowNode[] = [
    { id: 'orchestrator', label: 'Orchestrator', detail: 'Pipeline control', icon: 'account_tree' },
    { id: 'deterministic_ast', label: 'Deterministic AST', detail: 'Static parsing', icon: 'code' },
    { id: 'ruff', label: 'Ruff', detail: 'Lint security checks', icon: 'rule' },
    { id: 'rag', label: 'Tool call: RAG', detail: 'History retrieval', icon: 'database_search' },
    { id: 'owasp', label: 'OWASP tool', detail: 'Category + links', icon: 'shield' },
    { id: 'llm_model', label: 'LLM model', detail: 'Reasoning and fixes', icon: 'psychology' },
    { id: 'pull_request', label: 'PR review ready', detail: 'Ready to publish', icon: 'publish' }
  ];
  @ViewChild('workflowLane') workflowLane: ElementRef | undefined;

  constructor() { 
    const id = this.route.snapshot.paramMap.get('id'); 
    if (!id) { this.router.navigate(['/history']); return; } 
    this.service.loadById(id); 
    if (!this.service.current() && !this.isLoading()) this.router.navigate(['/history']); 
    
    // Watch for running stage changes and auto-scroll
    effect(() => {
      const item = this.review();
      if (item) {
        if (!this.activeFilePath() && item.files && item.files.length > 0) {
          const firstWithPath = item.comments.find(c => c.path)?.path;
          this.activeFilePath.set(firstWithPath || item.files[0].path);
        }
        if (this.workflowLane) {
          setTimeout(() => this.autoScrollToActiveStage(item), 100);
        }
      }
    });
  }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  currentFilePath(): string {
    const item = this.review();
    if (!item) return '';
    return this.activeFilePath() || (item.files && item.files.length > 0 ? item.files[0].path : '');
  }

  currentFileName(): string {
    const item = this.review();
    if (!item) return 'pasted-snippet.py';
    if (this.activeFilePath()) return this.activeFilePath();
    if (item.files && item.files.length > 0) return item.files[0].path;
    return item.name;
  }

  currentCode(): string {
    const item = this.review();
    if (!item) return '';
    if (item.files && item.files.length > 0) {
      const activePath = this.currentFilePath();
      const file = item.files.find(f => f.path === activePath);
      if (file) return file.code;
    }
    return item.code;
  }

  selectFile(path: string): void {
    this.activeFilePath.set(path);
  }

  fileIssueCount(path: string): number {
    return this.review()?.comments.filter(c => c.path === path).length ?? 0;
  }

  commentFor(line: number) {
    const item = this.review();
    if (!item) return undefined;
    const activePath = this.currentFilePath();
    return item.comments.find(comment => comment.line === line && (!comment.path || !activePath || comment.path === activePath));
  }

  selectFinding(note: InlineComment): void {
    if (note.path) {
      this.activeFilePath.set(note.path);
    }
    this.selectedFinding.set(note);
  }

  sourceLine(code: string, line: number): string {
    return this.currentCode().split('\n')[line - 1] || '';
  }
  codeParts(line: string, note: { evidence?: string }): { before: string; match: string; after: string } {
    const evidence = note.evidence;
    if (!evidence) return { before: line, match: '', after: '' };
    const index = line.indexOf(evidence);
    if (index < 0) return { before: line, match: '', after: '' };
    return { before: line.slice(0, index), match: evidence, after: line.slice(index + evidence.length) };
  }
  isSecret(note: { title: string; evidence?: string } | undefined): boolean {
    const text = `${note?.evidence ?? ''} ${note?.title ?? ''}`.toLowerCase();
    return !!note && ['key', 'password', 'secret', 'token', 'credential', 'sensitive'].some(term => text.includes(term));
  }
  marker(severity: Severity): string { return severity === 'critical' ? '!' : severity === 'high' ? '◆' : severity === 'medium' || severity === 'warning' ? '▲' : severity === 'low' ? '•' : '·'; }
  severityLabel(severity: Severity): string { return severity === 'warning' ? 'medium' : severity; }
  recommendationDetails(item: { code: string; comments: Array<{ line: number; replacement?: string }> }, raw: string): GuidanceCard {
    const match = raw.match(/^\s*###\s+\*\*\[([^\]]+)\]\s+\(([^)]+)\)\*\*\s+Line\s+(\d+)\s*\n?([\s\S]*?)(?:\s+PR Blocking:\s*(Yes|No)\.)?\s*$/i);
    const severity = match?.[1] ?? 'Recommendation';
    const line = match ? Number(match[3]) : null;
    const blocking = match?.[5] ? match[5].toLowerCase() === 'yes' : null;
    const body = (match?.[4] ?? raw).replace(/^\*\*|\*\*$/g, '').trim();
    const finding = line ? item.comments.find(comment => comment.line === line) : undefined;
    return { severity, line, body, blocking, codeLine: line ? this.sourceLine(item.code, line) : '', replacement: finding?.replacement ?? '' };
  }
  workflowEvents(item: { dagEvents: import('./review.service').DagEvent[] }): import('./review.service').DagEvent[] { return this.service.liveEvents().length ? this.service.liveEvents() : item.dagEvents; }
  workflowStatus(node: string, events: import('./review.service').DagEvent[]): WorkflowStatus {
    const stageIndex = this.workflowNodes.findIndex(item => item.id === node);
    if (stageIndex < 0) return 'pending';
    if (this.isLoading()) {
      const presentationStage = this.service.executionStage();
      if (presentationStage >= this.workflowNodes.length) return 'completed';
      if (stageIndex < presentationStage) return 'completed';
      return stageIndex === presentationStage ? 'running' : 'pending';
    }
    if (this.isStageCompleted(node, events)) return 'completed';
    const activeIndex = this.workflowNodes.findIndex(item => this.isStageStarted(item.id, events) && !this.isStageCompleted(item.id, events));
    return activeIndex === stageIndex ? 'running' : 'pending';
  }
  statusLabel(status: WorkflowStatus): string { return status === 'running' ? 'active' : status === 'completed' ? 'done' : 'waiting'; }
  toggleWorkflowLog(): void { this.workflowLogExpanded.update(expanded => !expanded); }
  workflowEventsForLoading(): import('./review.service').DagEvent[] { return this.service.liveEvents(); }
  loadingStageText(): string {
    const active = this.workflowNodes.find(node => this.workflowStatus(node.id, this.workflowEventsForLoading()) === 'running');
    return active ? `${active.label} is in progress...` : 'Preparing the review pipeline...';
  }
  loadingProgress(): number {
    const events = this.workflowEventsForLoading();
    const completed = this.workflowNodes.filter(node => this.workflowStatus(node.id, events) === 'completed').length;
    const running = this.workflowNodes.some(node => this.workflowStatus(node.id, events) === 'running') ? 0.5 : 0;
    return ((completed + running) / this.workflowNodes.length) * 100;
  }
  latestEvent(node: string, events: import('./review.service').DagEvent[]): string { return this.stageEvents(node, events).at(-1)?.event.replaceAll('_', ' ') ?? 'waiting for upstream'; }
  visibleWorkflowEvents(item: { dagEvents: import('./review.service').DagEvent[] }): import('./review.service').DagEvent[] { const events = this.workflowEvents(item); return this.selectedWorkflowNode() ? this.stageEvents(this.selectedWorkflowNode(), events) : events; }
  sendFeedback(reviewId: string, comment: string): void {
    const rating = this.feedback();
    if (!rating) return;
    this.service.submitFeedback(reviewId, rating, comment)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => { this.feedbackSent.set(true); this.feedback.set(''); },
        error: (err) => console.error('Feedback submission failed:', err),
        complete: () => console.log('Feedback submitted')
      });
  }

  private autoScrollToActiveStage(item: { dagEvents: import('./review.service').DagEvent[] }): void {
    if (!this.workflowLane) return;
    const laneElement = this.workflowLane.nativeElement;
    const activeNode = laneElement.querySelector('.workflow-node.running');
    if (activeNode) {
      const nodeRect = activeNode.getBoundingClientRect();
      const laneRect = laneElement.getBoundingClientRect();
      const scrollLeft = laneElement.scrollLeft;
      const offset = nodeRect.left - laneRect.left;
      
      // Scroll to center the active node, leaving some space from the left
      laneElement.scrollTo({
        left: scrollLeft + offset - 100,
        behavior: 'smooth'
      });
    }
  }

  private stageEvents(stageId: string, events: import('./review.service').DagEvent[]): import('./review.service').DagEvent[] {
    return events.filter(event => {
      if (stageId === 'orchestrator') return event.node === 'orchestrator' || event.node === 'model_armor';
      if (stageId === 'deterministic_ast') return event.node === 'static_analysis' || event.event.includes('python_ast_scanner');
      if (stageId === 'ruff') return event.node === 'ruff';
      if (stageId === 'rag') return event.node === 'rag';
      if (stageId === 'owasp') return event.node === 'owasp' || event.event.includes('owasp_context');
      if (stageId === 'llm_model') return event.node === 'agent_reasoner' || event.node === 'review_reasoner';
      if (stageId === 'pull_request') return event.node === 'pull_request' || event.node === 'memory';
      return false;
    });
  }

  private isStageStarted(stageId: string, events: import('./review.service').DagEvent[]): boolean {
    return this.stageEvents(stageId, events).length > 0;
  }

  private isStageCompleted(stageId: string, events: import('./review.service').DagEvent[]): boolean {
    if (stageId === 'orchestrator') return events.some(event => event.node === 'orchestrator' && event.event === 'pipeline_completed');
    if (stageId === 'deterministic_ast') return events.some(event => event.node === 'static_analysis' && event.event === 'ast_completed') || events.some(event => event.node === 'deterministic_gate' && event.event === 'passed');
    if (stageId === 'ruff') return events.some(event => event.node === 'ruff' && (event.event === 'scan_completed' || event.event === 'scan_skipped'));
    if (stageId === 'rag') return events.some(event => event.node === 'rag' && event.event === 'retrieval_completed');
    if (stageId === 'owasp') return events.some(event => event.node === 'owasp' && event.event === 'lookup_completed') || events.some(event => event.event === 'owasp_context_loaded');
    if (stageId === 'llm_model') return events.some(event => event.node === 'agent_reasoner' && event.event === 'reasoning_completed');
    if (stageId === 'pull_request') return events.some(event => event.node === 'pull_request' && event.event === 'review_ready');
    return false;
  }
}
