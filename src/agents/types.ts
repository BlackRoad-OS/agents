/**
 * Core type definitions for BlackRoad OS Agents
 *
 * Copyright (c) 2024-2026 BlackRoad OS, Inc. All Rights Reserved.
 */

import { z } from "zod";

export const AgentStatusSchema = z.enum(["idle", "running", "paused", "error", "terminated"]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const TaskStatusSchema = z.enum(["pending", "queued", "running", "completed", "failed", "cancelled"]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const AgentConfigSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  maxConcurrency: z.number().int().positive().default(5),
  timeoutMs: z.number().int().positive().default(30000),
  retryAttempts: z.number().int().min(0).default(3),
  retryDelayMs: z.number().int().min(0).default(1000),
  metadata: z.record(z.unknown()).optional(),
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const TaskConfigSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
  type: z.string().min(1),
  priority: z.number().int().min(0).max(100).default(50),
  payload: z.record(z.unknown()),
  timeoutMs: z.number().int().positive().optional(),
  dependencies: z.array(z.string().uuid()).default([]),
});
export type TaskConfig = z.infer<typeof TaskConfigSchema>;

export interface Agent {
  config: AgentConfig;
  status: AgentStatus;
  currentTasks: string[];
  completedTasks: number;
  failedTasks: number;
  startedAt: Date | null;
  lastActivityAt: Date | null;
}

export interface Task {
  config: TaskConfig;
  status: TaskStatus;
  result?: TaskResult;
  attempts: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface TaskResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  duration: number;
}

export interface CoordinatorConfig {
  maxAgents: number;
  taskQueueSize: number;
  healthCheckIntervalMs: number;
  shutdownTimeoutMs: number;
}
