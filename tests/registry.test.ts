import { describe, it, expect, beforeEach } from "vitest";
import { AgentRegistry } from "../src/agents/registry.js";
import type { AgentConfig } from "../src/agents/types.js";

function createConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
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

describe("AgentRegistry", () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  it("registers an agent", () => {
    const config = createConfig();
    const agent = registry.register(config);

    expect(agent.config.id).toBe(config.id);
    expect(agent.status).toBe("idle");
    expect(agent.currentTasks).toEqual([]);
    expect(agent.completedTasks).toBe(0);
    expect(agent.failedTasks).toBe(0);
  });

  it("rejects duplicate registration", () => {
    const config = createConfig();
    registry.register(config);

    expect(() => registry.register(config)).toThrow("already registered");
  });

  it("gets an agent by ID", () => {
    const config = createConfig();
    registry.register(config);

    const agent = registry.get(config.id);
    expect(agent).toBeDefined();
    expect(agent?.config.name).toBe("test-agent");
  });

  it("returns undefined for unknown agent", () => {
    expect(registry.get(crypto.randomUUID())).toBeUndefined();
  });

  it("unregisters an idle agent", () => {
    const config = createConfig();
    registry.register(config);

    expect(registry.unregister(config.id)).toBe(true);
    expect(registry.get(config.id)).toBeUndefined();
    expect(registry.size).toBe(0);
  });

  it("prevents unregistering a running agent", () => {
    const config = createConfig();
    registry.register(config);
    registry.updateStatus(config.id, "running");

    expect(() => registry.unregister(config.id)).toThrow("Cannot unregister running agent");
  });

  it("lists agents by status", () => {
    const c1 = createConfig();
    const c2 = createConfig();
    const c3 = createConfig();

    registry.register(c1);
    registry.register(c2);
    registry.register(c3);
    registry.updateStatus(c1.id, "running");

    expect(registry.getByStatus("idle").length).toBe(2);
    expect(registry.getByStatus("running").length).toBe(1);
  });

  it("updates agent status and timestamps", () => {
    const config = createConfig();
    registry.register(config);

    registry.updateStatus(config.id, "running");
    const agent = registry.get(config.id)!;

    expect(agent.status).toBe("running");
    expect(agent.startedAt).toBeInstanceOf(Date);
    expect(agent.lastActivityAt).toBeInstanceOf(Date);
  });

  it("throws when updating unknown agent", () => {
    expect(() => registry.updateStatus(crypto.randomUUID(), "idle")).toThrow("not found");
  });

  it("clears all idle agents", () => {
    registry.register(createConfig());
    registry.register(createConfig());

    registry.clear();
    expect(registry.size).toBe(0);
  });

  it("prevents clearing with running agents", () => {
    const config = createConfig();
    registry.register(config);
    registry.updateStatus(config.id, "running");

    expect(() => registry.clear()).toThrow("still running");
  });

  it("tracks size correctly", () => {
    expect(registry.size).toBe(0);

    const c1 = createConfig();
    registry.register(c1);
    expect(registry.size).toBe(1);

    registry.register(createConfig());
    expect(registry.size).toBe(2);

    registry.unregister(c1.id);
    expect(registry.size).toBe(1);
  });
});
