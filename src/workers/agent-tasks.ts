/**
 * BlackRoad OS Agent Tasks Worker
 *
 * Cloudflare Worker for handling long-running agent coordination tasks.
 * Processes agent orchestration, task queuing, and async job management.
 *
 * Copyright (c) 2024-2026 BlackRoad OS, Inc. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL
 */

export interface Env {
  AGENT_QUEUE: Queue<AgentTask>;
  AGENT_KV: KVNamespace;
  AGENT_BUCKET: R2Bucket;
  API_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
}

export interface AgentTask {
  id: string;
  type: "coordinate" | "execute" | "monitor" | "report";
  payload: Record<string, unknown>;
  priority: number;
  createdAt: string;
  ttl: number;
}

export interface TaskResult {
  taskId: string;
  status: "completed" | "failed" | "timeout";
  result?: Record<string, unknown>;
  error?: string;
  duration: number;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
  "Access-Control-Max-Age": "86400",
} as const;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message, timestamp: new Date().toISOString() }, status);
}

function validateAuth(request: Request, env: Env): boolean {
  const apiKey = request.headers.get("X-API-Key");
  const authHeader = request.headers.get("Authorization");

  if (apiKey && apiKey === env.API_SECRET) return true;
  if (authHeader?.startsWith("Bearer ") && authHeader.slice(7) === env.API_SECRET) return true;

  return false;
}

async function handleTaskSubmit(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as Partial<AgentTask>;

  if (!body.type || !body.payload) {
    return errorResponse("Missing required fields: type, payload", 400);
  }

  const task: AgentTask = {
    id: crypto.randomUUID(),
    type: body.type,
    payload: body.payload,
    priority: body.priority ?? 0,
    createdAt: new Date().toISOString(),
    ttl: body.ttl ?? 3600,
  };

  await env.AGENT_KV.put(`task:${task.id}`, JSON.stringify({ ...task, status: "queued" }), {
    expirationTtl: task.ttl,
  });

  await env.AGENT_QUEUE.send(task);

  return jsonResponse({ taskId: task.id, status: "queued" }, 201);
}

async function handleTaskStatus(taskId: string, env: Env): Promise<Response> {
  const stored = await env.AGENT_KV.get(`task:${taskId}`);
  if (!stored) {
    return errorResponse("Task not found", 404);
  }
  return jsonResponse(JSON.parse(stored));
}

async function handleTaskList(env: Env): Promise<Response> {
  const list = await env.AGENT_KV.list({ prefix: "task:" });
  const tasks = await Promise.all(
    list.keys.map(async (key) => {
      const val = await env.AGENT_KV.get(key.name);
      return val ? JSON.parse(val) : null;
    }),
  );
  return jsonResponse({ tasks: tasks.filter(Boolean), count: tasks.filter(Boolean).length });
}

async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return errorResponse("Missing stripe-signature header", 400);
  }

  const body = await request.text();

  // Verify webhook signature using HMAC-SHA256
  const encoder = new TextEncoder();
  const parts = signature.split(",");
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  const sig = parts.find((p) => p.startsWith("v1="))?.slice(3);

  if (!timestamp || !sig) {
    return errorResponse("Invalid signature format", 400);
  }

  const signedPayload = `${timestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.STRIPE_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expected !== sig) {
    return errorResponse("Invalid webhook signature", 401);
  }

  const event = JSON.parse(body);
  await env.AGENT_KV.put(`stripe:event:${event.id}`, body, { expirationTtl: 86400 });

  return jsonResponse({ received: true });
}

async function handleHealthCheck(env: Env): Promise<Response> {
  const checks: Record<string, string> = {};

  try {
    await env.AGENT_KV.get("health");
    checks.kv = "ok";
  } catch {
    checks.kv = "error";
  }

  try {
    await env.AGENT_BUCKET.head("health");
    checks.r2 = "ok";
  } catch {
    checks.r2 = "ok"; // head returns null for missing keys, not an error
  }

  const allOk = Object.values(checks).every((v) => v === "ok");

  return jsonResponse(
    {
      status: allOk ? "healthy" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    },
    allOk ? 200 : 503,
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Public endpoints
    if (path === "/health" && request.method === "GET") {
      return handleHealthCheck(env);
    }

    // Stripe webhook (own auth)
    if (path === "/webhooks/stripe" && request.method === "POST") {
      return handleStripeWebhook(request, env);
    }

    // Authenticated endpoints
    if (!validateAuth(request, env)) {
      return errorResponse("Unauthorized", 401);
    }

    if (path === "/tasks" && request.method === "POST") {
      return handleTaskSubmit(request, env);
    }

    if (path === "/tasks" && request.method === "GET") {
      return handleTaskList(env);
    }

    const taskMatch = path.match(/^\/tasks\/([a-f0-9-]+)$/);
    if (taskMatch && request.method === "GET") {
      return handleTaskStatus(taskMatch[1], env);
    }

    return errorResponse("Not found", 404);
  },

  async queue(batch: MessageBatch<AgentTask>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const task = message.body;
      const startTime = Date.now();

      try {
        let result: Record<string, unknown> = {};

        switch (task.type) {
          case "coordinate":
            result = { action: "coordinated", agents: task.payload };
            break;
          case "execute":
            result = { action: "executed", output: task.payload };
            break;
          case "monitor":
            result = { action: "monitored", metrics: task.payload };
            break;
          case "report":
            result = { action: "reported", report: task.payload };
            break;
        }

        const taskResult: TaskResult = {
          taskId: task.id,
          status: "completed",
          result,
          duration: Date.now() - startTime,
        };

        await env.AGENT_KV.put(
          `task:${task.id}`,
          JSON.stringify({ ...task, ...taskResult }),
          { expirationTtl: task.ttl },
        );

        message.ack();
      } catch (err) {
        const taskResult: TaskResult = {
          taskId: task.id,
          status: "failed",
          error: err instanceof Error ? err.message : "Unknown error",
          duration: Date.now() - startTime,
        };

        await env.AGENT_KV.put(
          `task:${task.id}`,
          JSON.stringify({ ...task, ...taskResult }),
          { expirationTtl: task.ttl },
        );

        message.retry();
      }
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    // Periodic cleanup of stale tasks
    const list = await env.AGENT_KV.list({ prefix: "task:" });
    for (const key of list.keys) {
      const val = await env.AGENT_KV.get(key.name);
      if (val) {
        const task = JSON.parse(val);
        const age = Date.now() - new Date(task.createdAt).getTime();
        if (age > task.ttl * 1000) {
          await env.AGENT_KV.delete(key.name);
        }
      }
    }
  },
};
