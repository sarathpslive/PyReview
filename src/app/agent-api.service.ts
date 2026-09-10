import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface EvaluationScenario {
  id: string;
  name: string;
  badge: string;
  description: string;
  prompt: string;
  code_snippet: string;
  expected_keywords: string[];
  expected_tools: string[];
  expected_rules: string[];
}

@Injectable({ providedIn: 'root' })
export class AgentApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:8000/api/v1';

  modelArmor(text: string): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(`${this.baseUrl}/security/model-armor/check`, { text, source: 'angular-agent-lab' });
  }

  getEvaluationScenarios(): Observable<{ status: string; docs_url: string; scenarios: EvaluationScenario[] }> {
    return this.http.get<{ status: string; docs_url: string; scenarios: EvaluationScenario[] }>(`${this.baseUrl}/agent/evaluate/scenarios`);
  }

  evaluate(
    prompt: string,
    codeSnippet: string,
    expectedKeywords: string[],
    options?: { scenarioId?: string; expectedTools?: string[]; expectedRules?: string[] }
  ): Observable<Record<string, unknown>> {
    const payload: Record<string, unknown> = {
      prompt,
      code_snippet: codeSnippet,
      expected_keywords: expectedKeywords,
    };
    if (options?.scenarioId) payload['scenario_id'] = options.scenarioId;
    if (options?.expectedTools) payload['expected_tools'] = options.expectedTools;
    if (options?.expectedRules) payload['expected_rules'] = options.expectedRules;
    return this.http.post<Record<string, unknown>>(`${this.baseUrl}/agent/evaluate`, payload);
  }

  story(title: string, summary: string, findings: unknown[]): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(`${this.baseUrl}/review/story`, { title, summary, findings });
  }

  githubReview(owner: string, repo: string, pullNumber: number, dryRun: boolean): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(`${this.baseUrl}/review/github-pr`, { owner, repo, pull_number: pullNumber, dry_run: dryRun });
  }
}