# @blackroad-os/agents

Autonomous agents and coordination logic for the BlackRoad system.

**Copyright (c) 2024-2026 BlackRoad OS, Inc. All Rights Reserved.**
**PROPRIETARY AND CONFIDENTIAL** — See [LICENSE](LICENSE) for terms.

---

## Architecture

```
src/
  agents/
    coordinator.ts   — Orchestrates agents and distributes tasks
    registry.ts      — Manages agent registration and lookup
    task-runner.ts   — Executes tasks with retry and timeout handling
    types.ts         — Core type definitions (Zod-validated)
  workers/
    agent-tasks.ts   — Cloudflare Worker for async task processing
  index.ts           — Public API exports
tests/
  coordinator.test.ts
  registry.test.ts
  task-runner.test.ts
```

## Setup

```bash
# Install dependencies
npm ci

# Run tests
npm test

# Build
npm run build

# Lint & format
npm run lint
npm run format:check

# Type check
npm run typecheck
```

## Usage

```typescript
import { AgentCoordinator } from "@blackroad-os/agents";

const coordinator = new AgentCoordinator({
  maxAgents: 50,
  taskQueueSize: 1000,
  healthCheckIntervalMs: 30000,
  shutdownTimeoutMs: 10000,
});

// Register a task handler
coordinator.registerTaskHandler("process", async (payload) => {
  return { result: "done", ...payload };
});

// Register an agent
const agentId = crypto.randomUUID();
coordinator.registerAgent({
  id: agentId,
  name: "worker-1",
  version: "1.0.0",
  maxConcurrency: 5,
  timeoutMs: 30000,
  retryAttempts: 3,
  retryDelayMs: 1000,
});

// Start the coordinator
coordinator.start();

// Submit and execute tasks
const taskId = crypto.randomUUID();
coordinator.submitTask({
  id: taskId,
  agentId,
  type: "process",
  priority: 50,
  payload: { input: "data" },
  dependencies: [],
});

const result = await coordinator.executeTask(taskId);
console.log(result);
// { success: true, data: { result: "done", input: "data" }, duration: ... }

// Check status
console.log(coordinator.getStatus());

// Shutdown
coordinator.stop();
```

## Cloudflare Worker

The `src/workers/agent-tasks.ts` worker handles long-running agent tasks via Cloudflare Workers with Queues, KV, and R2.

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | None | Health check |
| `POST` | `/tasks` | API Key | Submit a new task |
| `GET` | `/tasks` | API Key | List all tasks |
| `GET` | `/tasks/:id` | API Key | Get task status |
| `POST` | `/webhooks/stripe` | Stripe Signature | Handle Stripe webhooks |

### Worker Development

```bash
# Local dev
npm run dev:worker

# Deploy to staging
npx wrangler deploy --env staging

# Deploy to production (via CI or manual)
npx wrangler deploy --env production
```

## Deployments

| Platform | Purpose | Config | Workflow |
|----------|---------|--------|----------|
| **Cloudflare Workers** | Async task processing | `wrangler.toml` | `.github/workflows/deploy-cloudflare.yml` |
| **Vercel** | API & dashboard hosting | `vercel.json` | `.github/workflows/deploy-vercel.yml` |
| **Railway** | Long-running services | `railway.json` | `.github/workflows/deploy-railway.yml` |
| **GitHub Pages** | Documentation | `docs/` | `.github/workflows/pages.yml` |

## CI/CD Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push/PR to main | Lint, test (Node 18/20/22), build |
| `security.yml` | Push/PR + weekly | CodeQL, dependency audit, secret scan |
| `deploy-cloudflare.yml` | Push to main (workers/) | Deploy Cloudflare Worker |
| `deploy-vercel.yml` | Push/PR to main | Deploy Vercel (preview + production) |
| `deploy-railway.yml` | Push to main | Deploy Railway service |
| `automerge.yml` | Dependabot PRs | Auto-approve and merge patch/minor updates |
| `pages.yml` | Push to main (docs/) | Deploy GitHub Pages |
| `release.yml` | Tag push (v*) | Create GitHub Release |

All GitHub Actions are **pinned to specific commit hashes** for supply-chain security.

## Security

- All dependencies pinned to exact versions in `package.json`
- All GitHub Actions pinned to commit SHAs (not tags)
- Dependabot configured for automated dependency updates
- CodeQL analysis runs on every PR and weekly
- TruffleHog scans for leaked secrets
- HMAC-SHA256 webhook signature verification
- API key authentication on protected endpoints
- Security headers on all HTTP responses

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Required Secrets

Configure these in GitHub repository settings > Secrets:

| Secret | Service | Purpose |
|--------|---------|---------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare | Worker deployment |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare | Account identifier |
| `VERCEL_TOKEN` | Vercel | Deployment auth |
| `VERCEL_ORG_ID` | Vercel | Organization ID |
| `VERCEL_PROJECT_ID` | Vercel | Project ID |
| `RAILWAY_TOKEN` | Railway | Deployment auth |
| `STRIPE_SECRET_KEY` | Stripe | Payment processing |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Webhook verification |

## Stripe Integration

The Cloudflare Worker includes Stripe webhook handling for payment events. Webhook signatures are verified using HMAC-SHA256 at the edge before processing.

Products and billing configuration are managed through the Stripe Dashboard and connected to the worker via environment secrets.

## License

**BlackRoad OS, Inc. Proprietary Software License**

This software is the exclusive intellectual property of BlackRoad OS, Inc.
This is **not open source software**. All rights reserved.

See [LICENSE](LICENSE) for the complete license agreement.

Copyright (c) 2024-2026 BlackRoad OS, Inc. — Alexa Louise Amundson, Founder, CEO & Sole Stockholder.
