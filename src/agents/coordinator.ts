/**
 * Agent Coordinator - Orchestrates agents and distributes tasks
 *
 * Copyright (c) 2024-2026 BlackRoad OS, Inc. All Rights Reserved.
 */

import type { AgentConfig, CoordinatorConfig, TaskConfig, TaskResult } from "./types.js";
import { AgentRegistry } from "./registry.js";
import { TaskRunner, type TaskHandler } from "./task-runner.js";

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxAgents: 50,
  taskQueueSize: 1000,
  healthCheckIntervalMs: 30000,
  shutdownTimeoutMs: 10000,
};

export class AgentCoordinator {
  private config: CoordinatorConfig;
  private registry: AgentRegistry;
  private runner: TaskRunner;
  private running = false;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<CoordinatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registry = new AgentRegistry();
    this.runner = new TaskRunner();
  }

  start(): void {
    if (this.running) {
      throw new Error("Coordinator is already running");
    }

    this.running = true;
    this.healthCheckTimer = setInterval(() => {
      this.healthCheck();
    }, this.config.healthCheckIntervalMs);
  }

  stop(): void {
    if (!this.running) return;

    this.running = false;
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  registerAgent(config: AgentConfig): void {
    if (this.registry.size >= this.config.maxAgents) {
      throw new Error(`Maximum agent limit (${this.config.maxAgents}) reached`);
    }
    this.registry.register(config);
  }

  unregisterAgent(agentId: string): boolean {
    return this.registry.unregister(agentId);
  }

  registerTaskHandler(type: string, handler: TaskHandler): void {
    this.runner.registerHandler(type, handler);
  }

  submitTask(config: TaskConfig): void {
    const agent = this.registry.get(config.agentId);
    if (!agent) {
      throw new Error(`Agent ${config.agentId} not found`);
    }

    if (this.runner.getAllTasks().length >= this.config.taskQueueSize) {
      throw new Error("Task queue is full");
    }

    const task = this.runner.submit(config);
    agent.currentTasks.push(task.config.id);
    agent.lastActivityAt = new Date();
  }

  async executeTask(taskId: string): Promise<TaskResult> {
    const task = this.runner.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const agent = this.registry.get(task.config.agentId);
    if (agent) {
      this.registry.updateStatus(agent.config.id, "running");
    }

    const result = await this.runner.execute(taskId);

    if (agent) {
      agent.currentTasks = agent.currentTasks.filter((id) => id !== taskId);
      if (result.success) {
        agent.completedTasks++;
      } else {
        agent.failedTasks++;
      }
      if (agent.currentTasks.length === 0) {
        this.registry.updateStatus(agent.config.id, "idle");
      }
    }

    return result;
  }

  private healthCheck(): void {
    const agents = this.registry.getAll();
    for (const agent of agents) {
      if (agent.status === "running" && agent.lastActivityAt) {
        const idle = Date.now() - agent.lastActivityAt.getTime();
        if (idle > this.config.healthCheckIntervalMs * 3) {
          this.registry.updateStatus(agent.config.id, "error");
        }
      }
    }
  }

  getStatus() {
    return {
      running: this.running,
      agents: {
        total: this.registry.size,
        idle: this.registry.getByStatus("idle").length,
        running: this.registry.getByStatus("running").length,
        error: this.registry.getByStatus("error").length,
      },
      tasks: {
        total: this.runner.getAllTasks().length,
        pending: this.runner.getPendingTasks().length,
      },
    };
  }

  getRegistry(): AgentRegistry {
    return this.registry;
  }

  getRunner(): TaskRunner {
    return this.runner;
  }
}
