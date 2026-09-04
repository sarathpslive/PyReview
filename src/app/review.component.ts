import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReviewService, Severity } from './review.service';

@Component({
  selector: 'app-review', standalone: true, imports: [RouterLink],
  template: `
    @if (review(); as item) {
      <section class="page review-page">
        <div class="eyebrow">REVIEW COMPLETE <span></span> {{ item.findings }} FINDINGS</div>
        <div class="review-header">
          <div>
            <a routerLink="/" class="back">← New review</a>
            <h1>{{ item.name }}</h1>
            <div class="meta"><span class="python-badge">PY</span> {{ item.language }} <span>·</span> {{ item.source }} <span>·</span> {{ item.time }} <span>·</span> ID {{ item.id }}</div>
          </div>
          <div class="score">
            <small>CODE HEALTH</small>
            <strong>{{ item.score }}<sup>/100</sup></strong>
            <span>{{ item.findings ? item.criticalFindings + ' critical issues caught' : 'No blocking issues found' }}</span>
            <div class="review-counts"><b class="count-critical">{{ item.criticalFindings }} C</b><b class="count-high">{{ item.highFindings }} H</b><b class="count-medium">{{ item.mediumFindings }} M</b><b class="count-low">{{ item.lowFindings }} L</b><b class="count-suggestion">{{ item.suggestions }} S</b></div>
          </div>
        </div>

        <div class="summary-banner">
          <strong>Review summary</strong>
          <p>{{ item.summary ?? 'The review flagged a few high-priority issues that deserve attention before shipping.' }}</p>
          <div class="summary-tags">
            @for (tag of item.owaspContext ?? []; track tag) {
              <span>{{ tag }}</span>
            }
          </div>
        </div>

        <div class="review-grid">
          <div class="code-panel">
            <div class="panel-top"><span>source / {{ item.name }}</span><span>{{ item.code.split('\n').length }} lines <button title="Copy code">⧉</button></span></div>
            <div class="code-view">
              @for (line of item.code.split('\n'); track $index) {
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
            @if (item.findings === 0) {
              <div class="clean-review"><span class="clean-check">✓</span><strong>Clean review</strong><p>No issues were detected by the backend checks for this code.</p></div>
            } @else { @for (note of item.comments; track note.line) {
              <article class="finding" [class]="note.severity" [class.selected]="selectedFinding()?.line === note.line" (click)="selectFinding(note)">
                <div class="finding-line">
                  <span class="severity-dot"></span>
                  <span class="severity-label">{{ severityLabel(note.severity) }}</span>
                  <span class="line-label">line {{ note.line }}</span>
                </div>
                <h3>{{ note.title }}</h3>
                <p>{{ note.body }}</p>
              </article>
            } }
            @if ((item.recommendations ?? []).length > 0) {
              <div class="backend-recommendations"><span class="panel-kicker">ENGINE RECOMMENDATIONS</span>@for (recommendation of item.recommendations; track recommendation) { <p>→ {{ recommendation }}</p> }</div>
            }
            @if ((item.owaspContext ?? []).length > 0) {
              <div class="owasp-snippet">
                <div class="owasp-title-row"><span class="owasp-shield">⌁</span><div><span class="panel-kicker">SECURITY CONTEXT</span><h2>OWASP Top 10</h2></div><span class="owasp-badge">OWASP</span></div>
                <p>Relevant Top 10 areas from this review.</p>
                <div class="owasp-links">
                  @for (item of item.owaspContext ?? []; track item) {
                    <a [href]="owaspUrl(item)" target="_blank" rel="noopener noreferrer"><span>{{ owaspCode(item) }}</span>{{ item }}<b>↗</b></a>
                  }
                </div>
              </div>
            }
          </aside>
        </div>

        @if (selectedFinding(); as note) {
          <section class="comparison-panel">
            <div class="comparison-header"><div><span class="panel-kicker">SUGGESTED CHANGE</span><h2>{{ note.title }}</h2></div><span>line {{ note.line }}</span></div>
            <div class="comparison-grid">
              <div class="comparison-pane removed"><div class="comparison-label"><span>−</span> Current code</div><pre>{{ sourceLine(item.code, note.line) }}</pre></div>
              <div class="comparison-pane added"><div class="comparison-label"><span>+</span> Suggested replacement</div><pre>{{ note.replacement || 'No replacement snippet provided.' }}</pre></div>
            </div>
          </section>
        }

        <div class="review-engine"><span>ENGINE</span> {{ item.engine ?? 'Backend review' }} <span>·</span> {{ item.findings === 0 ? 'deterministic checks passed' : 'backend findings loaded' }}</div>

        <div class="review-actions"><button class="primary-btn" type="button" (click)="downloadPdf(item)">Download PDF <span>↓</span></button></div>

        <div class="feedback">
          <span>Was this review helpful?</span>
          <button [class.chosen]="feedback() === 'yes'" (click)="feedback.set('yes')">♧ Yes</button>
          <button [class.chosen]="feedback() === 'no'" (click)="feedback.set('no')">♧ Not quite</button>
          @if (feedback()) { <em>Thanks for the signal.</em> }
        </div>
      </section>
    } @else {
      <section class="page empty-state"><h1>No review yet.</h1><a routerLink="/">Start a new review →</a></section>
    }
  `
})
export class ReviewComponent {
  private readonly service = inject(ReviewService); private readonly route = inject(ActivatedRoute); private readonly router = inject(Router); readonly review = this.service.current; readonly feedback = signal<'yes' | 'no' | ''>(''); readonly selectedFinding = signal<ReturnType<typeof this.commentFor> | null>(null);
  constructor() { const id = this.route.snapshot.paramMap.get('id'); if (!id) { this.router.navigate(['/']); return; } this.service.loadById(id); if (!this.service.current()) this.router.navigate(['/']); }
  commentFor(line: number) { return this.review()?.comments.find(comment => comment.line === line); }
  selectFinding(note: NonNullable<ReturnType<typeof this.commentFor>>): void { this.selectedFinding.set(note); }
  sourceLine(code: string, line: number): string { return code.split('\n')[line - 1] || ''; }
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
  owaspCode(context: string): string {
    const codes: Record<string, string> = {
      'Broken Access Control': 'A01',
      'Cryptographic Failures': 'A02',
      'Injection': 'A03',
      'Insecure Design': 'A04',
      'Security Misconfiguration': 'A05',
      'Vulnerable and Outdated Components': 'A06',
      'Identification and Authentication Failures': 'A07',
      'Software and Data Integrity Failures': 'A08',
      'Security Logging and Monitoring Failures': 'A09',
      'Server-Side Request Forgery (SSRF)': 'A10'
    };
    return codes[context] ?? 'OWASP';
  }
  owaspUrl(context: string): string {
    const urls: Record<string, string> = {
      'Broken Access Control': 'https://owasp.org/Top10/A01_2021-Broken_Access_Control/',
      'Cryptographic Failures': 'https://owasp.org/Top10/A02_2021-Cryptographic_Failures/',
      'Injection': 'https://owasp.org/Top10/A03_2021-Injection/',
      'Insecure Design': 'https://owasp.org/Top10/A04_2021-Insecure_Design/',
      'Security Misconfiguration': 'https://owasp.org/Top10/A05_2021-Security_Misconfiguration/',
      'Vulnerable and Outdated Components': 'https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/',
      'Identification and Authentication Failures': 'https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/',
      'Software and Data Integrity Failures': 'https://owasp.org/Top10/A08_2021-Software_and_Data_Integrity_Failures/',
      'Security Logging and Monitoring Failures': 'https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/',
      'Server-Side Request Forgery (SSRF)': 'https://owasp.org/Top10/A10_2021-Server-Side_Request_Forgery_%28SSRF%29/'
    };
    return urls[context] ?? 'https://owasp.org/www-project-top-ten/';
  }
  downloadPdf(item: NonNullable<ReturnType<typeof this.review>>): void {
    const pdf = this.createReportPdf(item);
    const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${item.name.replace(/[^a-z0-9._-]/gi, '_')}-review.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private createReportPdf(item: NonNullable<ReturnType<typeof this.review>>): string {
    const objects: string[] = [];
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    const pages: string[] = [];
    const pageContents: string[] = [];
    let commands = this.pdfReportHeader(item);
    let y = 690;
    const addPage = (): void => { pageContents.push(commands.join('\n')); commands = this.pdfReportHeader(item); y = 690; };
    const ensureSpace = (height: number): void => { if (y - height < 48) addPage(); };

    commands.push(this.pdfText('Review overview', 46, y, 15, '0.09 0.13 0.20'));
    y -= 28;
    const cards: Array<[string, number, string, string]> = [
      ['CRITICAL', item.criticalFindings, '0.77 0.24 0.32', '0.99 0.93 0.94'],
      ['HIGH', item.highFindings, '0.72 0.47 0.09', '1 0.97 0.88'],
      ['MEDIUM', item.mediumFindings, '0.18 0.43 0.76', '0.92 0.96 1'],
      ['LOW', item.lowFindings, '0.40 0.46 0.53', '0.95 0.96 0.98'],
      ['SUGGESTIONS', item.suggestions, '0.30 0.54 0.38', '0.92 0.97 0.93']
    ];
    cards.forEach((card, index) => {
      const x = 46 + index * 104;
      commands.push(this.pdfRect(x, y - 65, 94, 58, card[3] as string, card[2] as string));
      commands.push(this.pdfText(String(card[1]), x + 39, y - 32, 20, '0.09 0.13 0.20'));
      commands.push(this.pdfText(card[0], x + 12, y - 52, 6.5, card[2]));
    });
    y -= 88;
    commands.push(this.pdfText('Detailed findings', 46, y, 15, '0.09 0.13 0.20'));
    commands.push(this.pdfLine(46, y - 10, 566, y - 10, '0.72 0.78 0.86'));
    y -= 32;
    if (!item.comments.length) {
      commands.push(this.pdfRect(46, y - 42, 520, 40, '0.92 0.97 0.93', '0.30 0.54 0.38'));
      commands.push(this.pdfText('Clean review - no issues detected.', 62, y - 24, 10, '0.30 0.54 0.38'));
      y -= 62;
    } else {
      item.comments.forEach(note => {
        const detailLines = this.pdfWrap(`Recommendation: ${note.body}`, 92);
        const replacementLines = this.pdfWrap(`Suggested replacement: ${note.replacement ?? 'None provided'}`, 92);
        const height = 48 + (detailLines.length + replacementLines.length) * 11;
        ensureSpace(height);
        const colors = this.pdfSeverityPalette(note.severity);
        commands.push(this.pdfRect(46, y - height, 520, height, colors.background, colors.accent));
        commands.push(this.pdfText(`${this.severityLabel(note.severity).toUpperCase()}  |  LINE ${note.line}`, 62, y - 18, 7, colors.accent));
        commands.push(this.pdfText(note.title, 62, y - 36, 11, '0.09 0.13 0.20'));
        let textY = y - 54;
        detailLines.forEach(line => { commands.push(this.pdfText(line, 62, textY, 7.5, '0.35 0.42 0.50')); textY -= 11; });
        textY -= 2;
        replacementLines.forEach(line => { commands.push(this.pdfText(line, 62, textY, 7.5, '0.22 0.48 0.36')); textY -= 11; });
        y -= height + 14;
      });
    }
    ensureSpace(92);
    commands.push(this.pdfText('Review summary', 46, y, 15, '0.09 0.13 0.20'));
    commands.push(this.pdfLine(46, y - 10, 566, y - 10, '0.72 0.78 0.86'));
    y -= 30;
    this.pdfWrap(item.summary ?? 'No summary provided.', 100).forEach(line => { commands.push(this.pdfText(line, 46, y, 8.5, '0.35 0.42 0.50')); y -= 13; });
    y -= 12;
    ensureSpace(100);
    commands.push(this.pdfText('Source code', 46, y, 15, '0.09 0.13 0.20'));
    y -= 18;
    const sourceLines = item.code.split('\n');
    sourceLines.forEach((line, index) => {
      if (y < 55) { addPage(); y = 700; commands.push(this.pdfText('Source code (continued)', 46, y, 15, '0.09 0.13 0.20')); y -= 22; }
      commands.push(this.pdfText(`${String(index + 1).padStart(3, '0')}  ${line}`.slice(0, 108), 52, y, 7.2, '0.15 0.20 0.28')); y -= 11;
    });
    pageContents.push(commands.join('\n'));
    objects.push(`<< /Type /Pages /Kids [${pageContents.map((_, index) => `${4 + index * 2} 0 R`).join(' ')}] /Count ${pageContents.length} >>`);
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
    pageContents.forEach((content, pageIndex) => {
      const withFooter = `${content}\n${this.pdfText(`Page ${pageIndex + 1} / ${pageContents.length}`, 480, 24, 7, '0.40 0.48 0.56')}`;
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + pageIndex * 2} 0 R >>`);
      objects.push(`<< /Length ${withFooter.length} >>\nstream\n${withFooter}\nendstream`);
    });
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return pdf;
  }

  private pdfText(value: string, x: number, y: number, size: number, color: string): string {
    return `${color} rg BT /F1 ${size} Tf ${x} ${y} Td (${this.pdfEscape(value)}) Tj ET`;
  }

  private pdfReportHeader(item: NonNullable<ReturnType<typeof this.review>>): string[] {
    return [
      'q', '1 1 1 rg', '0 0 612 792 re', 'f', 'Q',
      'q', '0.05 0.09 0.17 rg', '0 730 612 62 re', 'f', 'Q',
      this.pdfText('PyReview', 42, 764, 22, '1 1 1'),
      this.pdfText('CODE REVIEW REPORT', 44, 744, 8, '0.45 0.90 0.84'),
      this.pdfText(`${item.name}  |  ${item.language}  |  ${item.score}/100`, 350, 758, 7, '0.76 0.83 0.92'),
      this.pdfText(`Review ID: ${item.id}`, 350, 744, 7, '0.76 0.83 0.92')
    ];
  }

  private pdfRect(x: number, y: number, width: number, height: number, fill: string, stroke: string): string {
    return `q ${fill} rg ${stroke} RG 0.8 w ${x} ${y} ${width} ${height} re B Q`;
  }

  private pdfLine(x1: number, y1: number, x2: number, y2: number, color: string): string {
    return `q ${color} RG 0.8 w ${x1} ${y1} m ${x2} ${y2} l S Q`;
  }

  private pdfWrap(value: string, width: number): string[] {
    const words = value.split(/\s+/);
    const lines: string[] = [];
    let current = '';
    words.forEach(word => {
      if ((current + ' ' + word).trim().length > width && current) {
        lines.push(current);
        current = word;
      } else {
        current = `${current} ${word}`.trim();
      }
    });
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  }

  private pdfSeverityPalette(severity: Severity): { accent: string; background: string } {
    if (severity === 'critical') return { accent: '0.77 0.24 0.32', background: '0.99 0.93 0.94' };
    if (severity === 'high') return { accent: '0.72 0.47 0.09', background: '1 0.97 0.88' };
    if (severity === 'medium' || severity === 'warning') return { accent: '0.18 0.43 0.76', background: '0.92 0.96 1' };
    if (severity === 'low') return { accent: '0.40 0.46 0.53', background: '0.95 0.96 0.98' };
    return { accent: '0.30 0.54 0.38', background: '0.92 0.97 0.93' };
  }

  private pdfSeverityColor(line: string): string {
    if (line.startsWith('[CRITICAL]')) return '0.77 0.24 0.32';
    if (line.startsWith('[HIGH]')) return '0.72 0.47 0.09';
    if (line.startsWith('[MEDIUM]')) return '0.18 0.43 0.76';
    if (line.startsWith('[LOW]')) return '0.40 0.46 0.53';
    return '0.30 0.54 0.38';
  }

  private pdfEscape(value: string): string { return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\r?\n/g, ' '); }
}
