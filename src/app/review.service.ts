import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type ReviewInput = 'Paste code' | 'Upload file' | 'GitHub URL';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'suggestion' | 'warning';

export interface InlineComment {
  line: number;
  severity: Severity;
  title: string;
  body: string;
  evidence?: string;
  replacement?: string;
}

interface DemoFinding {
  line: number;
  severity?: Severity | string;
  rule_id: string;
  message: string;
  recommendation: string;
  evidence: string;
  replacement?: string;
}

interface ApiReviewResponse {
  review_id: string;
  language: string;
  source: string;
  findings?: DemoFinding[];
  summary: string;
  owasp_context: string[];
  recommendations?: string[];
  llm_provider?: string;
  llm_model?: string;
  llm_fallback_used?: boolean;
}

const API_URL = 'http://127.0.0.1:8000/api/v1/review';
const REVIEW_START_URL = `${API_URL}/start`;

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
  recommendations?: string[];
  engine?: string;
}

@Injectable({ providedIn: 'root' })
export class ReviewService {
  private readonly http = inject(HttpClient);
  private readonly storageKey = 'pyreview.history.v2';
  private readonly pendingKey = 'pyreview.pending-review';
  readonly current = signal<ReviewRecord | null>(null);
  readonly history = signal<ReviewRecord[]>(this.readHistory());

  startReview(source: ReviewInput, name: string, code: string): Promise<string> {
    return firstValueFrom(this.http.post<{ review_id: string }>(REVIEW_START_URL, { code_snippet: code, language: 'python' })).then(response => {
      sessionStorage.setItem(this.pendingKey, JSON.stringify({ source, name, code }));
      return response.review_id;
    });
  }

  pendingReview(): { source: ReviewInput; name: string; code: string } | undefined {
    try { return JSON.parse(sessionStorage.getItem(this.pendingKey) ?? 'null') ?? undefined; } catch { return undefined; }
  }

  getReviewStatus(id: string): Promise<{ status: string; result?: ApiReviewResponse; error?: string }> {
    return firstValueFrom(this.http.get<{ status: string; result?: ApiReviewResponse; error?: string }>(`${API_URL}/${encodeURIComponent(id)}`));
  }

  storeApiResult(response: ApiReviewResponse, source: ReviewInput = 'Paste code', name = 'pasted-snippet.py', code = ''): void {
    const comments: InlineComment[] = (response.findings ?? []).map(finding => ({ line: finding.line, severity: this.mapSeverity(finding.severity), title: finding.message, body: `${finding.recommendation} (${finding.rule_id})`, evidence: finding.evidence, replacement: finding.replacement }));
    const counts = this.countSeverities(comments);
    const review: ReviewRecord = { id: response.review_id, name: this.createUniqueName(), source, language: response.language || 'Python', score: Math.max(0, 100 - counts.criticalFindings * 25 - counts.highFindings * 15 - counts.mediumFindings * 8 - counts.lowFindings * 3 - counts.suggestions * 2), findings: comments.length, ...counts, time: 'Just now', code, comments, summary: response.summary, owaspContext: response.owasp_context, recommendations: response.recommendations ?? [], engine: response.llm_fallback_used ? 'Deterministic fallback' : response.llm_provider };
    const nextHistory = [review, ...this.history().filter(item => item.id !== review.id)];
    this.current.set(review);
    this.history.set(nextHistory);
    this.saveHistory(nextHistory);
  }

  submit(source: ReviewInput, name: string, code: string): Promise<string> {
    return firstValueFrom(this.http.post<ApiReviewResponse>(API_URL, { code_snippet: code, language: 'python' })).then(response => {
      const mappedComments: InlineComment[] = (response.findings ?? []).map(finding => ({
        line: finding.line,
        severity: this.mapSeverity(finding.severity),
        title: finding.message,
        body: `${finding.recommendation} (${finding.rule_id})`,
        evidence: finding.evidence,
        replacement: finding.replacement
      }));
      const counts = this.countSeverities(mappedComments);
      const review: ReviewRecord = {
        id: response.review_id || this.createId(),
        name: this.createUniqueName(),
        source,
        language: response.language || 'Python',
        score: Math.max(0, 100 - counts.criticalFindings * 25 - counts.highFindings * 15 - counts.mediumFindings * 8 - counts.lowFindings * 3 - counts.suggestions * 2),
        findings: mappedComments.length,
        ...counts,
        time: 'Just now',
        code,
        comments: mappedComments,
        summary: response.summary,
        owaspContext: response.owasp_context,
        recommendations: response.recommendations ?? [],
        engine: response.llm_fallback_used ? 'Deterministic fallback' : response.llm_provider
      };

      this.current.set(review);
      const nextHistory = [review, ...this.history()];
      this.history.set(nextHistory);
      this.saveHistory(nextHistory);
      return review.id;
    });
  }

  load(review: ReviewRecord): void {
    this.current.set(review);
  }

  loadById(id: string): void {
    const review = this.history().find(item => item.id === id);
    this.current.set(review ?? null);
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
        suggestions: item.suggestions ?? 0
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

  private countSeverities(comments: InlineComment[]): { criticalFindings: number; highFindings: number; mediumFindings: number; lowFindings: number; suggestions: number } {
    return {
      criticalFindings: comments.filter(comment => comment.severity === 'critical').length,
      highFindings: comments.filter(comment => comment.severity === 'high').length,
      mediumFindings: comments.filter(comment => comment.severity === 'medium').length,
      lowFindings: comments.filter(comment => comment.severity === 'low').length,
      suggestions: comments.filter(comment => comment.severity === 'suggestion').length
    };
  }

  private mapSeverity(severity: DemoFinding['severity']): Severity {
    const normalized = typeof severity === 'string' ? severity.trim().toLowerCase() : '';
    if (normalized === 'critical' || normalized === 'error') return 'critical';
    if (normalized === 'high') return 'high';
    if (normalized === 'medium' || normalized === 'warning') return 'medium';
    if (normalized === 'low') return 'low';
    if (normalized === 'suggestion' || normalized === 'info') return 'suggestion';
    return 'critical';
  }
}
