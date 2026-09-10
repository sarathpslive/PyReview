import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type ReviewInput = 'Paste code' | 'Upload file' | 'GitHub URL';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'suggestion' | 'warning';

export interface InlineComment {
  line: number;
  path?: string;
  severity: Severity;
  title: string;
  body: string;
  evidence?: string;
  replacement?: string;
}

export interface ReviewFile {
  path: string;
  name: string;
  code: string;
}

export interface BusinessDocument {
  fileName: string;
  content: string;
  type: 'jira' | 'specification' | 'requirements' | 'other';
  uploadedAt?: string;
}

interface ReviewFinding {
  line: number;
  path?: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'suggestion';
  message: string;
  recommendation: string;
  evidence: string;
  replacement: string;
}

export interface DagEvent { node: string; event: string; timestamp: string; payload: Record<string, unknown>; }
export interface OwaspFinding { category: string; url: string; importance: string; rule_ids: string[]; }
export interface BusinessLogicFinding { issue: string; severity: 'critical' | 'high' | 'medium' | 'low'; context: string; alignment: string; }

export interface ReviewRecord {
  id: string;
  name: string;
  source: ReviewInput;
  language: string;
  score: number;
  findings: number;
  criticalFindings: number;
  highFindings: number;
  mediumFindings: number;
  lowFindings: number;
  suggestions: number;
  time: string;
  code: string;
  comments: InlineComment[];
  summary?: string;
  owaspContext?: string[];
  owaspFindings: OwaspFinding[];
  businessDocuments?: BusinessDocument[];
  businessLogicFindings?: BusinessLogicFinding[];
  recommendations: string[];
  dagEvents: DagEvent[];
  prUrl?: string;
  prNumber?: number;
  files?: ReviewFile[];
}

@Injectable({ providedIn: 'root' })
export class ReviewService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:8000/api/v1';
  private readonly storageKey = 'pyreview.history.v3';
  readonly current = signal<ReviewRecord | null>(null);
  readonly history = signal<ReviewRecord[]>(this.readHistory());
  readonly liveEvents = signal<DagEvent[]>([]);
  readonly activeReviewId = signal<string | null>(null);
  readonly executionStage = signal(0);

  submit(source: ReviewInput, name: string, code: string, language = 'python', businessDocuments?: BusinessDocument[], onStarted?: (reviewId: string) => void): Observable<ReviewRecord> {
    return new Observable(subscriber => {
      this.liveEvents.set([]);
      let pollHandle: ReturnType<typeof setInterval> | undefined;
      let stageHandle: ReturnType<typeof setInterval> | undefined;
      let pendingResult: Record<string, any> | null = null;
      let backendComplete = false;
      const stageDurationMs = 5000 / 7;
      const finish = (): void => {
        if (pollHandle) clearInterval(pollHandle);
        if (stageHandle) clearInterval(stageHandle);
      };
      const finishStagePresentation = (): void => {
        if (!pendingResult) return;
        if (stageHandle) clearInterval(stageHandle);
        finish();
        this.activeReviewId.set(null);
        this.executionStage.set(7);
        const review = this.fromApi(pendingResult, source, name, code, language, businessDocuments);
        this.current.set(review);
        const nextHistory = [review, ...this.history()];
        this.history.set(nextHistory);
        this.saveHistory(nextHistory);
        subscriber.next(review);
        subscriber.complete();
      };
      subscriber.add(finish);
      const payload: Record<string, any> = { code_snippet: code, language };
      if (source === 'GitHub URL') {
        payload['github_url'] = code;
      }
      if (businessDocuments && businessDocuments.length > 0) {
        payload['business_documents'] = businessDocuments;
      }
      this.http.post<Record<string, any>>(`${this.apiUrl}/review/start`, payload).subscribe({
        next: started => {
          const reviewId = String(started['review_id']);
          this.current.set(null);
          this.activeReviewId.set(reviewId);
          this.executionStage.set(0);
          onStarted?.(reviewId);
          stageHandle = setInterval(() => {
            if (this.executionStage() < 6) this.executionStage.update(stage => stage + 1);
            else if (backendComplete) {
              this.executionStage.set(7);
              finishStagePresentation();
            }
          }, stageDurationMs);
          pollHandle = setInterval(() => this.http.get<Record<string, any>>(`${this.apiUrl}/review/${reviewId}`).subscribe({
            next: state => {
              this.liveEvents.set((state['events'] ?? []) as DagEvent[]);
              if (state['status'] === 'completed' && state['result']) {
                pendingResult = state['result'];
                backendComplete = true;
              } else if (state['status'] === 'failed') {
                finish();
                if (stageHandle) clearInterval(stageHandle);
                this.activeReviewId.set(null);
                subscriber.error(new Error(String(state['error'] ?? 'Review failed')));
              }
            },
            error: error => { finish(); subscriber.error(error); }
          }), 250);
        },
        error: error => subscriber.error(error)
      });
    });
  }

  private fromApi(result: Record<string, any>, source: ReviewInput, name: string, code: string, language: string, businessDocuments?: BusinessDocument[]): ReviewRecord {
    const mappedComments: InlineComment[] = (result['findings'] ?? []).map((finding: ReviewFinding) => ({
      line: Number(finding.line ?? 1),
      path: finding.path,
      severity: this.mapSeverity(String(finding.severity ?? 'low')),
      title: String(finding.message ?? 'Issue detected'),
      body: `${finding.recommendation ?? 'Review this finding.'}${finding.evidence ? ` (${finding.evidence})` : ''}`,
      evidence: finding.evidence,
      replacement: finding.replacement
    }));
    const criticalFindings = mappedComments.filter(comment => comment.severity === 'critical').length;
    const highFindings = mappedComments.filter(comment => comment.severity === 'high').length;
    const mediumFindings = mappedComments.filter(comment => comment.severity === 'medium').length;
    const lowFindings = mappedComments.filter(comment => comment.severity === 'low').length;
    const suggestions = mappedComments.filter(comment => comment.severity === 'suggestion').length;
    const findings = mappedComments.length;

    const prUrl = result['pr_url'] ?? result['github_pr_url'] ?? result['github_pr_review']?.['pr_url'];
    const prNumber = result['pr_number'] ?? result['github_pr_review']?.['pull_number'];
    const rawFiles = (result['files'] ?? result['github_pr_review']?.['files'] ?? []) as ReviewFile[];
    const files = Array.isArray(rawFiles) && rawFiles.length > 0 ? rawFiles : undefined;

    const review: ReviewRecord = {
      id: String(result['review_id'] ?? this.createId()),
      name: String(result['name'] ?? (name || 'pasted-snippet.py')),
      source,
      language: this.displayLanguage(String(result['language'] ?? language)),
      score: Math.max(0, 100 - criticalFindings * 25 - highFindings * 15 - mediumFindings * 8 - lowFindings * 3 - suggestions * 2),
      findings,
      criticalFindings,
      highFindings,
      mediumFindings,
      lowFindings,
      suggestions,
      time: 'Just now',
      code: String(result['source_code'] ?? code),
      comments: mappedComments,
      summary: String(result['summary'] ?? 'Review completed.'),
      owaspContext: (result['owasp_context'] ?? []).map(String),
      owaspFindings: (result['owasp_findings'] ?? []) as OwaspFinding[],
      businessDocuments: businessDocuments,
      businessLogicFindings: (result['business_logic_findings'] ?? []) as BusinessLogicFinding[],
      recommendations: (result['recommendations'] ?? []).map(String),
      dagEvents: (result['dag_events'] ?? []) as DagEvent[],
      prUrl: prUrl ? String(prUrl) : undefined,
      prNumber: prNumber ? Number(prNumber) : undefined,
      files
    };
    return review;
  }

  load(review: ReviewRecord): void {
    this.current.set(review);
  }

  loadById(id: string): void {
    const review = this.history().find(item => item.id === id);
    this.current.set(review ?? null);
  }

  submitFeedback(reviewId: string, rating: 'helpful' | 'needs_work', comment: string): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/review/${reviewId}/feedback`, { rating, comment });
  }

  private createId(): string {
    const suffix = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
    return `review-${Date.now()}-${suffix}`;
  }

  private createUniqueName(): string {
    const existingNames = new Set(this.history().map(item => item.name));
    let count = 1;
    while (existingNames.has(`sample_code_review-${String(count).padStart(2, '0')}.py`)) count++;
    return `sample_code_review-${String(count).padStart(2, '0')}.py`;
  }

  private readHistory(): ReviewRecord[] {
    try {
      const stored = localStorage.getItem(this.storageKey);
      const items = stored ? JSON.parse(stored) as Partial<ReviewRecord>[] : [];
      return items.map(item => ({
        ...item,
        id: item.id ?? this.createId(),
        highFindings: item.highFindings ?? 0,
        mediumFindings: item.mediumFindings ?? 0,
        lowFindings: item.lowFindings ?? 0,
        suggestions: item.suggestions ?? 0,
        owaspFindings: item.owaspFindings ?? [],
        recommendations: item.recommendations ?? [],
        dagEvents: item.dagEvents ?? []
      } as ReviewRecord));
    } catch {
      return [];
    }
  }

  private saveHistory(items: ReviewRecord[]): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(items));
    } catch {
      // Reviews remain available for the current session if storage is unavailable.
    }
  }

  private mapSeverity(severity: string): Severity {
    if (severity === 'major' || severity === 'error') return 'high';
    if (severity === 'minor') return 'medium';
    if (severity === 'info') return 'suggestion';
    return severity as Severity;
  }

  private displayLanguage(language: string): string {
    return language.charAt(0).toUpperCase() + language.slice(1).toLowerCase();
  }
}
