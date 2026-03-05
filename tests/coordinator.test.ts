import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AgentCoordinator } from "../src/agents/coordinator.js";
import type { AgentConfig, TaskConfig } from "../src/agents/types.js";

function createAgentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: crypto.randomUUID(),
    name: "test-agent",
    version: "1.0.0",
    maxConcurrency: 5,
    timeoutMs: 30000,
    retryAttempts: 3,
    retryDelayMs: 1000,
    ...overrides,
  };
}

function createTaskConfig(agentId: string, overrides: Partial<TaskConfig> = {}): TaskConfig {
  return {
    id: crypto.randomUUID(),
    agentId,
    type: "test",
    priority: 50,
    payload: { data: "test" },
    dependencies: [],
    ...overrides,
  };
}

describe("AgentCoordinator", () => {
  let coordinator: AgentCoordinator;

  beforeEach(() => {
    coordinator = new AgentCoordinator({ healthCheckIntervalMs: 60000 });
    coordinator.registerTaskHandler("test", async (payload) => ({ processed: true, ...payload }));
  });

  afterEach(() => {
    coordinator.stop();
  });

  it("starts and stops", () => {
    coordinator.start();
    expect(coordinator.getStatus().running).toBe(true);

    coordinator.stop();
    expect(coordinator.getStatus().running).toBe(false);
  });

  it("prevents double start", () => {
    coordinator.start();
    expect(() => coordinator.start()).toThrow("already running");
  });

  it("registers agents", () => {
    const config = createAgentConfig();
    coordinator.registerAgent(config);

    const status = coordinator.getStatus();
    expect(status.agents.total).toBe(1);
    expect(status.agents.idle).toBe(1);
  });

  it("enforces max agent limit", () => {
    const coord = new AgentCoordinator({ maxAgents: 2, taskQueueSize: 100, healthCheckIntervalMs: 60000, shutdownTimeoutMs: 10000 });
    coord.registerAgent(createAgentConfig());
    coord.registerAgent(createAgentConfig());

    expect(() => coord.registerAgent(createAgentConfig())).toThrow("Maximum agent limit");
  });

  it("submits and executes a task", async () => {
    const agentConfig = createAgentConfig();
    coordinator.registerAgent(agentConfig);

    const taskConfig = createTaskConfig(agentConfig.id);
    coordinator.submitTask(taskConfig);

    const result = await coordinator.executeTask(taskConfig.id);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ processed: true, data: "test" });
  });

  it("rejects task for unknown agent", () => {
    const taskConfig = createTaskConfig(crypto.randomUUID());
    expect(() => coordinator.submitTask(taskConfig)).toThrow("not found");
  });

  it("tracks agent task counts", async () => {
    const agentConfig = createAgentConfig();
    coordinator.registerAgent(agentConfig);

    const t1 = createTaskConfig(agentConfig.id);
    coordinator.submitTask(t1);
    await coordinator.executeTask(t1.id);

    const agent = coordinator.getRegistry().get(agentConfig.id);
    expect(agent?.completedTasks).toBe(1);
    expect(agent?.status).toBe("idle");
  });

  it("tracks failed tasks", async () => {
    coordinator.registerTaskHandler("failing", async () => {
      throw new Error("Task failed");
    });

    const agentConfig = createAgentConfig();
    coordinator.registerAgent(agentConfig);

    const taskConfig = createTaskConfig(agentConfig.id, { type: "failing" });
    coordinator.submitTask(taskConfig);
    await coordinator.executeTask(taskConfig.id);

    const agent = coordinator.getRegistry().get(agentConfig.id);
    expect(agent?.failedTasks).toBe(1);
  });

  it("returns comprehensive status", () => {
    coordinator.start();
    const agentConfig = createAgentConfig();
    coordinator.registerAgent(agentConfig);
    coordinator.submitTask(createTaskConfig(agentConfig.id));

    const status = coordinator.getStatus();
    expect(status).toEqual({
      running: true,
      agents: { total: 1, idle: 1, running: 0, error: 0 },
      tasks: { total: 1, pending: 1 },
    });
  });

  it("enforces task queue size", () => {
    const coord = new AgentCoordinator({ maxAgents: 10, taskQueueSize: 2, healthCheckIntervalMs: 60000, shutdownTimeoutMs: 10000 });
    coord.registerTaskHandler("test", async (p) => p);

    const agentConfig = createAgentConfig();
    coord.registerAgent(agentConfig);

    coord.submitTask(createTaskConfig(agentConfig.id));
    coord.submitTask(createTaskConfig(agentConfig.id));

    expect(() => coord.submitTask(createTaskConfig(agentConfig.id))).toThrow("queue is full");
  });
});
