/**
 * Agent Registry - Manages registration and lookup of agents
 *
 * Copyright (c) 2024-2026 BlackRoad OS, Inc. All Rights Reserved.
 */

import type { Agent, AgentConfig, AgentStatus } from "./types.js";
import { AgentConfigSchema } from "./types.js";

export class AgentRegistry {
  private agents: Map<string, Agent> = new Map();

  register(config: AgentConfig): Agent {
    const validated = AgentConfigSchema.parse(config);

    if (this.agents.has(validated.id)) {
      throw new Error(`Agent ${validated.id} is already registered`);
    }

    const agent: Agent = {
      config: validated,
      status: "idle",
      currentTasks: [],
      completedTasks: 0,
      failedTasks: 0,
      startedAt: null,
      lastActivityAt: null,
    };

    this.agents.set(validated.id, agent);
    return agent;
  }

  unregister(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    if (agent.status === "running") {
      throw new Error(`Cannot unregister running agent ${agentId}`);
    }

    return this.agents.delete(agentId);
  }

  get(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  getAll(): Agent[] {
    return Array.from(this.agents.values());
  }

  getByStatus(status: AgentStatus): Agent[] {
    return this.getAll().filter((agent) => agent.status === status);
  }

  updateStatus(agentId: string, status: AgentStatus): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    agent.status = status;
    agent.lastActivityAt = new Date();

    if (status === "running" && !agent.startedAt) {
      agent.startedAt = new Date();
    }
  }

  get size(): number {
    return this.agents.size;
  }

  clear(): void {
    const running = this.getByStatus("running");
    if (running.length > 0) {
      throw new Error(`Cannot clear registry: ${running.length} agents still running`);
    }
    this.agents.clear();
  }
}
