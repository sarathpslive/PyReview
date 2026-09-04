import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ReviewService } from './review.service';

interface ReviewEvent {
  type?: string;
  review_id?: string;
  node?: string;
  event?: string;
  timestamp?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

@Component({
  selector: 'app-events',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="page events-page">
      <div class="eyebrow">LIVE REVIEW ACTIVITY <span></span> WEBSOCKET STREAM</div>
      <div class="events-heading">
        <div><h1>Event stream.</h1><p>Watch the review engine move from source scan to recommendation.</p></div>
        <span class="stream-status" [class.connected]="connected()"><i></i>{{ connected() ? 'Live' : 'Offline' }}</span>
      </div>

      <div class="stream-controls">
        <label for="review-id">Review ID</label>
        <input id="review-id" [(ngModel)]="reviewId" placeholder="review-..." (keyup.enter)="connect()">
        <button class="primary-btn" type="button" (click)="connect()">{{ connected() ? 'Reconnect' : 'Connect' }} <span>↗</span></button>
      </div>

      @if (streamError()) { <div class="stream-error" role="alert"><span>!</span><div><strong>Review unavailable</strong><p>{{ streamError() }}</p></div></div> }
      @if (resultReady()) { <div class="stream-complete" role="status"><span>✓</span><div><strong>Review complete</strong><p>The backend result is ready to inspect.</p></div><button class="primary-btn" type="button" (click)="openReview()">Open review <span>→</span></button></div> }
      @if (streamStats().lifecycle) { <div class="lifecycle-banner"><span class="lifecycle-pulse"></span><div><span class="panel-kicker">AGENTIC PIPELINE</span><strong>{{ streamStats().lifecycleLabel }}</strong><small>{{ streamStats().stageLabel }}</small></div><b>{{ streamStats().progress }}%</b></div> }

      <section class="dag-panel">
        <div class="graph-heading"><div><span class="panel-kicker">LIVE DAG</span><h2>Review intelligence flow</h2></div><span>{{ streamStats().traffic }} signals</span></div>
        <div class="dag-track">
          @for (stage of streamStats().pipeline; track stage.id; let last = $last) {
            <div class="dag-node" [class]="stage.status"><span class="dag-node-icon">{{ stage.icon }}</span><strong>{{ stage.label }}</strong><small>{{ stage.detail }}</small><em>{{ stage.status }}</em></div>
            @if (!last) { <span class="dag-connector" [class.active]="stage.status === 'complete'"><i></i></span> }
          }
        </div>
      </section>

      @if (!reviewId && !service.history().length) {
        <div class="stream-empty"><strong>No review is available yet.</strong><span>Submit a review first, then return here to watch its activity.</span></div>
      }

      <div class="event-summary"><span><b>{{ events().length }}</b> events received</span><span>Endpoint <code>/api/v1/ws/reviews/{{ reviewId || 'review-id' }}</code></span></div>
      <div class="stream-dashboard">
        <article class="stream-metric"><span>Pipeline progress</span><strong>{{ streamStats().progress }}<small>%</small></strong><div class="metric-track"><i [style.width.%]="streamStats().progress"></i></div></article>
        <article class="stream-metric"><span>Engine nodes</span><strong>{{ streamStats().nodes }}</strong><small>unique stages observed</small></article>
        <article class="stream-metric"><span>Source length</span><strong>{{ streamStats().sourceLength }}<small> chars</small></strong><small>reported by analyzer</small></article>
        <article class="stream-metric"><span>Findings detected</span><strong>{{ streamStats().findings }}</strong><small>latest analysis value</small></article>
      </div>
      <section class="activity-graph">
        <div class="graph-heading"><div><span class="panel-kicker">STREAM TELEMETRY</span><h2>Pipeline activity</h2></div><span>{{ streamStats().completed }} / {{ streamStats().stages }} stages</span></div>
        <div class="activity-bars">
          @for (point of streamStats().timeline; track $index) {
            <div class="activity-bar-wrap" [attr.title]="point.label"><span class="activity-bar" [style.height.%]="point.height"></span><small>{{ point.short }}</small></div>
          } @empty { <div class="graph-placeholder">Events will appear here as the review runs.</div> }
        </div>
      </section>
      <div class="event-list">
        @for (item of events(); track $index) {
          <article class="event-item" [class.connected-event]="item.type === 'connected'">
            <div class="event-index">{{ ($index + 1).toString().padStart(2, '0') }}</div>
            <div class="event-body">
              <div class="event-top"><strong>{{ item.event || item.type || 'event' }}</strong><span>{{ item.node || 'stream' }}</span><time>{{ item.timestamp || 'now' }}</time></div>
              @if (item.payload && payloadEntries(item.payload).length) { <div class="event-values">@for (entry of payloadEntries(item.payload); track entry.key) { <span><small>{{ entry.key }}</small><b>{{ entry.value }}</b></span> }</div> }
            </div>
          </article>
        } @empty {
          <div class="stream-empty"><strong>Waiting for events.</strong><span>Connect a review ID to open the live stream.</span></div>
        }
      </div>
      <section class="pr-handoff" [class.ready]="streamStats().prReady">
        <div class="pr-handoff-icon">↗</div><div><span class="panel-kicker">FINAL HANDOFF</span><h2>Open review</h2><p>{{ streamStats().prMessage }}</p></div>
        <button class="primary-btn" type="button" [disabled]="!streamStats().prReady" (click)="openPr()">Open review <span>↗</span></button>
      </section>
      @if (prMessage()) { <p class="pr-note" role="status">{{ prMessage() }}</p> }
    </section>
  `
})
export class EventsComponent implements OnDestroy {
  readonly service = inject(ReviewService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly events = signal<ReviewEvent[]>([]);
  readonly connected = signal(false);
  readonly streamError = signal('');
  readonly resultReady = signal(false);
  readonly prMessage = signal('');
  readonly streamStats = computed(() => {
    const items = this.events();
    const nodes = new Set(items.map(item => item.node).filter(Boolean));
    const analysisEvents = items.filter(item => item.type !== 'connected');
    const lifecycle = items.filter(item => item.type?.startsWith('review_')).at(-1)?.type?.replace('review_', '') ?? '';
    const latest = analysisEvents.at(-1);
    const prEvent = items.find(item => item.node === 'pull_request');
    const sourceLength = this.numericPayload(items, 'source_length');
    const findings = this.numericPayload(items, 'finding_count') ?? this.numericPayload(items, 'count') ?? 0;
    const stages = 5;
    const completed = Math.min(stages, analysisEvents.filter(item => item.event !== 'started').length);
    const timeline = items.map((item, index) => ({
      label: `${item.node || 'stream'} / ${item.event || item.type || 'event'}`,
      short: String(index + 1).padStart(2, '0'),
      height: Math.max(15, ((index + 1) / Math.max(items.length, 1)) * 100)
    }));
    const lifecycleLabel = lifecycle === 'completed' ? 'Review completed' : lifecycle === 'failed' ? 'Review failed' : lifecycle === 'started' ? 'Review in progress' : '';
    const stageLabel = latest ? `${latest.node || 'pipeline'} / ${latest.event || 'processing'}` : 'Waiting for the first event';
    const stageDefinitions = [
      { id: 'orchestrator', label: 'Orchestrator', detail: 'routes the review', icon: '◎', nodes: ['review_lifecycle', 'repo_loader'] },
      { id: 'armor', label: 'Model Armor', detail: 'checks prompt safety', icon: '◇', nodes: ['model_armor'] },
      { id: 'tools', label: 'Tool Calls', detail: 'scans source + OWASP', icon: '⌘', nodes: ['tool_calls', 'static_analysis', 'deterministic_gate'] },
      { id: 'rag', label: 'RAG Memory', detail: 'retrieves prior fixes', icon: '◈', nodes: ['rag', 'memory'] },
      { id: 'reasoner', label: 'LLM Reasoning', detail: 'ranks recommendations', icon: '✦', nodes: ['agent_reasoner', 'review_reasoner'] },
      { id: 'pr', label: 'PR Handoff', detail: 'ready for delivery', icon: '↗', nodes: ['pull_request'] }
    ];
    let lastActiveIndex = -1;
    for (let index = stageDefinitions.length - 1; index >= 0; index--) {
      if (stageDefinitions[index].nodes.some(node => items.some(item => item.node === node))) {
        lastActiveIndex = index;
        break;
      }
    }
    const pipeline = stageDefinitions.map((stage, index) => {
      const seen = stage.nodes.some(node => items.some(item => item.node === node));
      const isLastActive = index === lastActiveIndex;
      return { ...stage, status: lifecycle === 'completed' ? 'complete' : seen ? (isLastActive ? 'active' : 'complete') : 'pending' };
    });
    const prReady = !!prEvent;
    const prMessage = prReady ? 'The review is complete and ready to continue in your GitHub workflow.' : 'The review will prepare this handoff after all checks and recommendations complete.';
    return { nodes: nodes.size, sourceLength: sourceLength ?? 0, findings, completed, stages, progress: lifecycle === 'completed' ? 100 : Math.round((completed / stages) * 100), lifecycle, lifecycleLabel, stageLabel, timeline, pipeline, traffic: items.length, prReady, prMessage };
  });
  reviewId = this.route.snapshot.paramMap.get('id') ?? this.service.history()[0]?.id ?? '';
  private socket?: WebSocket;

  constructor() {
    if (this.reviewId) this.connect();
  }

  connect(): void {
    this.socket?.close();
    this.events.set([]);
    this.connected.set(false);
    this.streamError.set('');
    this.resultReady.set(false);
    if (!this.reviewId.trim()) return;
    this.socket = new WebSocket(`ws://127.0.0.1:8000/api/v1/ws/reviews/${encodeURIComponent(this.reviewId.trim())}`);
    this.socket.onopen = () => this.connected.set(true);
    this.socket.onmessage = message => {
      try {
        const event = JSON.parse(message.data) as ReviewEvent;
        if (event.type === 'review_failed' || event.event === 'review_failed') {
          this.streamError.set(String(event.payload?.['error'] ?? 'The review is no longer available. Start a new review to create a fresh stream.'));
          this.connected.set(false);
          return;
        }
        this.events.update(items => [...items, event]);
        if (event.type === 'review_completed' || event.event === 'review_completed') void this.loadCompletedResult();
      } catch { /* Ignore malformed stream messages. */ }
    };
    this.socket.onclose = () => this.connected.set(false);
    this.socket.onerror = () => this.connected.set(false);
  }

  private async loadCompletedResult(): Promise<void> {
    const status = await this.service.getReviewStatus(this.reviewId);
    if (status.result) {
      const pending = this.service.pendingReview();
      this.service.storeApiResult(status.result, pending?.source, pending?.name, pending?.code);
      this.resultReady.set(true);
    }
  }

  openReview(): void { this.router.navigate(['/review', this.reviewId]); }

  openPr(): void { this.router.navigate(['/review', this.reviewId]); }

  payloadEntries(payload: Record<string, unknown>): Array<{ key: string; value: string }> {
    return Object.entries(payload).map(([key, value]) => ({ key: key.replaceAll('_', ' '), value: typeof value === 'object' ? JSON.stringify(value) : String(value) }));
  }

  private numericPayload(items: ReviewEvent[], key: string): number | undefined {
    for (const item of items) {
      const value = item.payload?.[key];
      if (typeof value === 'number') return value;
    }
    return undefined;
  }

  ngOnDestroy(): void {
    this.socket?.close();
  }
}
