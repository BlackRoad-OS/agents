import { describe, it, expect, beforeEach } from "vitest";
import { TaskRunner } from "../src/agents/task-runner.js";
import type { TaskConfig } from "../src/agents/types.js";

function createTaskConfig(overrides: Partial<TaskConfig> = {}): TaskConfig {
  return {
    id: crypto.randomUUID(),
    agentId: crypto.randomUUID(),
    type: "test",
    priority: 50,
    payload: { data: "test" },
    dependencies: [],
    ...overrides,
  };
}

describe("TaskRunner", () => {
  let runner: TaskRunner;

  beforeEach(() => {
    runner = new TaskRunner();
    runner.registerHandler("test", async (payload) => ({ processed: true, ...payload }));
  });

  it("submits a task", () => {
    const config = createTaskConfig();
    const task = runner.submit(config);

    expect(task.config.id).toBe(config.id);
    expect(task.status).toBe("pending");
    expect(task.attempts).toBe(0);
  });

  it("rejects task with unknown handler", () => {
    const config = createTaskConfig({ type: "unknown" });
    expect(() => runner.submit(config)).toThrow("No handler registered");
  });

  it("executes a task successfully", async () => {
    const config = createTaskConfig();
    runner.submit(config);

    const result = await runner.execute(config.id);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ processed: true, data: "test" });
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it("retries failed tasks", async () => {
    let callCount = 0;
    runner.registerHandler("flaky", async () => {
      callCount++;
      if (callCount < 3) throw new Error("Temporary failure");
      return { recovered: true };
    });

    const config = createTaskConfig({ type: "flaky" });
    runner.submit(config);

    const result = await runner.execute(config.id, 3, 10);

    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  it("fails after max retries", async () => {
    runner.registerHandler("failing", async () => {
      throw new Error("Permanent failure");
    });

    const config = createTaskConfig({ type: "failing" });
    runner.submit(config);

    const result = await runner.execute(config.id, 1, 10);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Permanent failure");

    const task = runner.getTask(config.id);
    expect(task?.status).toBe("failed");
  });

  it("handles timeout", async () => {
    runner.registerHandler("slow", async () => {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return {};
    });

    const config = createTaskConfig({ type: "slow", timeoutMs: 50 });
    runner.submit(config);

    const result = await runner.execute(config.id, 0, 10);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Task timeout");
  });

  it("returns pending tasks sorted by priority", () => {
    const low = createTaskConfig({ priority: 10 });
    const high = createTaskConfig({ priority: 90 });
    const mid = createTaskConfig({ priority: 50 });

    runner.submit(low);
    runner.submit(high);
    runner.submit(mid);

    const pending = runner.getPendingTasks();
    expect(pending[0].config.priority).toBe(90);
    expect(pending[1].config.priority).toBe(50);
    expect(pending[2].config.priority).toBe(10);
  });

  it("cancels a pending task", () => {
    const config = createTaskConfig();
    runner.submit(config);

    expect(runner.cancel(config.id)).toBe(true);
    expect(runner.getTask(config.id)?.status).toBe("cancelled");
  });

  it("cannot cancel a completed task", async () => {
    const config = createTaskConfig();
    runner.submit(config);
    await runner.execute(config.id);

    expect(runner.cancel(config.id)).toBe(false);
  });

  it("clears all non-running tasks", async () => {
    runner.submit(createTaskConfig());
    runner.submit(createTaskConfig());

    runner.clear();
    expect(runner.getAllTasks().length).toBe(0);
  });

  it("throws when executing unknown task", async () => {
    await expect(runner.execute(crypto.randomUUID())).rejects.toThrow("not found");
  });
});
