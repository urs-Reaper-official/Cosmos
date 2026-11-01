"use client";

import { useState } from "react";
import type { Database } from "@/types/database";

export type SavedMemory = Pick<
  Database["public"]["Tables"]["cosmos_memories"]["Row"],
  "id" | "content" | "created_at"
>;

function responseMessage(body: unknown, fallback: string) {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    body.error &&
    typeof body.error === "object" &&
    "message" in body.error &&
    typeof body.error.message === "string"
  ) {
    return body.error.message;
  }
  return fallback;
}

export function useMemorySettings(initialEnabled: boolean, initialMemories: SavedMemory[]) {
  const [enabled, setEnabledState] = useState(initialEnabled);
  const [memories, setMemories] = useState(initialMemories);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function setEnabled(nextEnabled: boolean) {
    setPending(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryEnabled: nextEnabled }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(responseMessage(body, "Could not update memory settings."));
      setEnabledState(nextEnabled);
      setStatus(nextEnabled ? "Saved memories will be used in future chats." : "Memory is off.");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Could not update memory settings.",
      );
    } finally {
      setPending(false);
    }
  }

  async function saveMemory(content: string): Promise<boolean> {
    setPending(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(responseMessage(body, "Could not save this memory."));
      if (!body || typeof body !== "object" || !("memory" in body)) {
        throw new Error("The server returned an invalid memory response.");
      }
      setMemories((current) => [body.memory as SavedMemory, ...current]);
      setStatus("Memory saved.");
      return true;
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Could not save this memory.",
      );
      return false;
    } finally {
      setPending(false);
    }
  }

  async function deleteMemory(id: string) {
    setPending(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch(`/api/memories/${encodeURIComponent(id)}`, { method: "DELETE" });
      const body: unknown = response.status === 204 ? null : await response.json();
      if (!response.ok) throw new Error(responseMessage(body, "Could not delete this memory."));
      setMemories((current) => current.filter((memory) => memory.id !== id));
      setStatus("Memory deleted.");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Could not delete this memory.",
      );
    } finally {
      setPending(false);
    }
  }

  return { enabled, memories, pending, error, status, setEnabled, saveMemory, deleteMemory };
}
