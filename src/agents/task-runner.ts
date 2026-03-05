/**
 * Task Runner - Executes tasks with retry logic and timeout handling
 *
 * Copyright (c) 2024-2026 BlackRoad OS, Inc. All Rights Reserved.
 */

import type { Task, TaskConfig, TaskResult } from "./types.js";
import { TaskConfigSchema } from "./types.js";

export type TaskHandler = (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;

export class TaskRunner {
  private tasks: Map<string, Task> = new Map();
  private handlers: Map<string, TaskHandler> = new Map();

  registerHandler(type: string, handler: TaskHandler): void {
    this.handlers.set(type, handler);
  }

  submit(config: TaskConfig): Task {
    const validated = TaskConfigSchema.parse(config);

    if (!this.handlers.has(validated.type)) {
      throw new Error(`No handler registered for task type: ${validated.type}`);
    }

    const task: Task = {
      config: validated,
      status: "pending",
      attempts: 0,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
    };

    this.tasks.set(validated.id, task);
    return task;
  }

  async execute(taskId: string, maxRetries = 3, retryDelayMs = 1000): Promise<TaskResult> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const handler = this.handlers.get(task.config.type);
    if (!handler) {
      throw new Error(`No handler for task type: ${task.config.type}`);
    }

    task.status = "running";
    task.startedAt = new Date();

    const timeoutMs = task.config.timeoutMs ?? 30000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      task.attempts = attempt + 1;
      const startTime = Date.now();

      try {
        const data = await Promise.race([
          handler(task.config.payload),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Task timeout")), timeoutMs),
          ),
        ]);

        const result: TaskResult = {
          success: true,
          data,
          duration: Date.now() - startTime,
        };

        task.status = "completed";
        task.completedAt = new Date();
        task.result = result;
        return result;
      } catch (err) {
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
          continue;
        }

        const result: TaskResult = {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
          duration: Date.now() - startTime,
        };

        task.status = "failed";
        task.completedAt = new Date();
        task.result = result;
        return result;
      }
    }

    // Unreachable but satisfies TypeScript
    throw new Error("Unexpected execution path");
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  getPendingTasks(): Task[] {
    return this.getAllTasks()
      .filter((t) => t.status === "pending")
      .sort((a, b) => (b.config.priority ?? 0) - (a.config.priority ?? 0));
  }

  cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status === "completed" || task.status === "failed") {
      return false;
    }
    task.status = "cancelled";
    task.completedAt = new Date();
    return true;
  }

  clear(): void {
    const running = this.getAllTasks().filter((t) => t.status === "running");
    if (running.length > 0) {
      throw new Error(`Cannot clear: ${running.length} tasks still running`);
    }
    this.tasks.clear();
  }
}
