import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { chatWithOllama } from "../services/ollama";
import type { WorkflowRun } from "../types";
import { AppDataProvider } from "./AppDataProvider";
import { useAppData } from "./app-data";

vi.mock("../services/ollama", () => ({
  chatWithOllama: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <AppDataProvider>{children}</AppDataProvider>;
}

describe("Ollama domain integration", () => {
  it("executes local workflow steps and records unsupported side effects", async () => {
    const { result } = renderHook(() => useAppData(), { wrapper });

    let workflowId = "";
    act(() => {
      workflowId = result.current.createWorkflow({
        name: "Lokaler Workflow-Test",
        triggerType: "manual",
        isActive: true,
        steps: [
          {
            id: "local-metrics",
            order: 1,
            action: "collect-metrics",
            parameters: { period: "7d" },
          },
          {
            id: "external-email",
            order: 2,
            action: "send-email",
            parameters: {},
          },
        ],
      }).id;
    });

    let run: WorkflowRun | undefined;
    await act(async () => {
      run = await result.current.runWorkflow(workflowId);
    });

    expect(run).toMatchObject({ status: "failed" });
    expect(run?.stepResults?.[0]).toMatchObject({
      status: "completed",
      action: "collect-metrics",
    });
    expect(run?.stepResults?.[1]).toMatchObject({
      status: "failed",
      action: "send-email",
    });
    expect(run?.stepResults?.[1]?.error).toMatch(/externe Integration/i);
  });

  it("calls Ollama for an agent workflow step and persists usage", async () => {
    vi.mocked(chatWithOllama).mockResolvedValueOnce({
      model: "gemma3:4b",
      content: "Generierter Workflow-Inhalt",
      promptTokens: 25,
      completionTokens: 8,
      totalDurationMs: 900,
    });
    const { result } = renderHook(() => useAppData(), { wrapper });
    const agentId = result.current.agents[0]?.id;
    expect(agentId).toBeTruthy();

    let workflowId = "";
    act(() => {
      workflowId = result.current.createWorkflow({
        name: "Ollama Workflow-Test",
        triggerType: "manual",
        isActive: true,
        steps: [
          {
            id: "agent-step",
            order: 1,
            action: "generate-content",
            agentId,
            parameters: { tone: "freundlich" },
          },
        ],
      }).id;
    });

    let run: WorkflowRun | undefined;
    await act(async () => {
      run = await result.current.runWorkflow(workflowId);
    });

    expect(chatWithOllama).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "http://127.0.0.1:11434",
        model: "gemma3",
      }),
    );
    expect(run).toMatchObject({ status: "completed" });
    expect(run?.stepResults?.[0]).toMatchObject({
      status: "completed",
      output: "Generierter Workflow-Inhalt",
      model: "gemma3:4b",
      promptTokens: 25,
      completionTokens: 8,
    });
  });

  it("supports the constrained workflow condition language", async () => {
    const { result } = renderHook(() => useAppData(), { wrapper });
    let workflowId = "";
    act(() => {
      workflowId = result.current.createWorkflow({
        name: "Bedingungs-Test",
        triggerType: "manual",
        isActive: true,
        steps: [
          {
            id: "never-step",
            order: 1,
            action: "collect-metrics",
            condition: "never",
            parameters: {},
          },
        ],
      }).id;
    });

    let run: WorkflowRun | undefined;
    await act(async () => {
      run = await result.current.runWorkflow(workflowId);
    });

    expect(run).toMatchObject({ status: "completed" });
    expect(run?.stepResults?.[0]).toMatchObject({ status: "skipped" });
  });
});
