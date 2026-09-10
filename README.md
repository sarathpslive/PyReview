# PyReview Angular Dashboard

Enterprise code review dashboard built with Angular 19, providing interactive security screening, ADK agent evaluation scorecard, and tool trajectory inspection.

## Quick Start: How to Run Manually

`ash
cd C:\Coding_learning\pyengineer_ang\PyReviewAngular

# Install dependencies (first time)
npm install

# Start Angular development server
npm start
# Server runs at http://localhost:4200/
`

## Features

- **01 / Model Armor**: Programmatic threat screening and prompt injection jailbreak detector.
- **02 / Scorecard (ADK)**: Benchmark agent behavior against golden specifications. Includes deep-link to the live local **Google ADK Web UI (Port 8085)**.
- **Trajectory Trace Inspector**: Interactive DAG modal displaying tool sequence, execution latencies, inputs, outputs, and golden benchmark match percentage.
- **03 / Delivery Kit**: Automated GitHub PR review with inline suggestions and Jira story synthesis.

## Connected Services

- **FastAPI Backend**: http://localhost:8000 (Swagger: http://localhost:8000/docs)
- **Google ADK Dev Web UI**: http://localhost:8085/dev-ui/
