"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useMemorySettings, type SavedMemory } from "@/hooks/use-memory-settings";

export function MemoryManager({
  initialEnabled,
  initialMemories,
}: {
  initialEnabled: boolean;
  initialMemories: SavedMemory[];
}) {
  const [draft, setDraft] = useState("");
  const { enabled, memories, pending, error, status, setEnabled, saveMemory, deleteMemory } =
    useMemorySettings(initialEnabled, initialMemories);

  async function submitMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || pending) return;
    if (await saveMemory(content)) setDraft("");
  }

  function confirmDelete(memory: SavedMemory) {
    if (window.confirm("Delete this saved memory?")) void deleteMemory(memory.id);
  }

  return (
    <section className="settings-section" aria-labelledby="memory-heading">
      <h2 id="memory-heading">Saved memory</h2>
      <p>
        Add details you want COSMOS to use in future chats. Memory is off until you enable it; saved
        details remain in your account until you delete them.
      </p>

      <div className="memory-toggle-row">
        <div>
          <strong>Use saved memories in chat</strong>
          <small>Only enabled memories are added to model context.</small>
        </div>
        <button
          className="toggle-button"
          type="button"
          role="switch"
          aria-label="Use saved memories in chat"
          aria-checked={enabled}
          disabled={pending}
          onClick={() => void setEnabled(!enabled)}
        />
      </div>

      <form className="memory-form" onSubmit={submitMemory}>
        <label>
          <span className="field-label">Add a memory</span>
          <input
            className="text-field"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={1200}
            placeholder="For example: I prefer concise project updates."
            aria-label="Memory content"
            disabled={pending}
          />
        </label>
        <button className="memory-add" type="submit" disabled={pending || !draft.trim()}>
          <Plus size={14} aria-hidden="true" /> Add memory
        </button>
      </form>

      {error && (
        <p className="inline-status error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="inline-status" role="status">
          {status}
        </p>
      )}

      {memories.length === 0 ? (
        <p className="memory-empty">No saved memories yet. You decide what to add.</p>
      ) : (
        <div className="memory-list" aria-label="Saved memories">
          <AnimatePresence initial={false}>
            {memories.map((memory) => (
              <motion.article
                className="memory-item"
                key={memory.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, margin: 0, paddingBlock: 0 }}
                transition={{ duration: 0.16 }}
              >
                <div>
                  <p>{memory.content}</p>
                  <time dateTime={memory.created_at}>
                    Added {new Date(memory.created_at).toLocaleDateString()}
                  </time>
                </div>
                <button
                  className="memory-delete"
                  type="button"
                  aria-label="Delete saved memory"
                  title="Delete memory"
                  disabled={pending}
                  onClick={() => confirmDelete(memory)}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}
