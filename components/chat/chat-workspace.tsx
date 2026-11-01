"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  Copy,
  FilePlus2,
  Menu,
  MessageSquarePlus,
  Paperclip,
  Pin,
  PinOff,
  Search,
  Send,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  Wrench,
  X,
  Pencil,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { signOutAction } from "@/lib/auth/actions";
import { useWorkspacePreferences } from "@/hooks/use-workspace-preferences";
import { MarkdownMessage } from "@/components/chat/markdown-message";
import { CosmosMark } from "@/components/ui/cosmos-mark";
import { consumeChatStream } from "@/lib/utils/chat-stream";
import type { ModelDescriptor, ProviderId } from "@/lib/ai/provider-types";
import type { Database } from "@/types/database";

type Conversation = Pick<
  Database["public"]["Tables"]["conversations"]["Row"],
  "id" | "title" | "updated_at"
>;
type ChatMessage = Pick<
  Database["public"]["Tables"]["messages"]["Row"],
  "id" | "role" | "content" | "created_at"
>;
type SendOperation = { editFromMessageId?: string; regenerate?: boolean };
type ChatWorkspaceProps = {
  conversations: Conversation[];
  initialConversationId: string | null;
  initialMessages: ChatMessage[];
  userId: string;
  userEmail: string;
  providerId: ProviderId;
  providers: { id: ProviderId; name: string; configured: boolean }[];
  model: string;
  calculatorEnabled: boolean;
};

const suggestions = [
  "Help me turn a rough idea into a practical plan.",
  "Explain a difficult topic in clear, simple terms.",
  "Compare a few options and help me decide.",
];

export function ChatWorkspace({
  conversations: initialConversations,
  initialConversationId,
  initialMessages,
  userId,
  userEmail,
  providerId: initialProviderId,
  providers,
  model: initialModel,
  calculatorEnabled: initialCalculatorEnabled,
}: ChatWorkspaceProps) {
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState(initialConversationId);
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [failedPrompt, setFailedPrompt] = useState<string | null>(null);
  const [failedOperation, setFailedOperation] = useState<SendOperation>({});
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const [search, setSearch] = useState("");
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [greeting, setGreeting] = useState("Welcome back");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [models, setModels] = useState<ModelDescriptor[]>([]);
  const [modelDiscoveryError, setModelDiscoveryError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamingMessageId = useRef<string | null>(null);
  const shouldAutoScroll = useRef(true);
  const {
    model,
    providerId,
    calculatorEnabled,
    pending: preferencePending,
    error: preferenceError,
    updatePreferences,
  } = useWorkspacePreferences(initialModel, initialCalculatorEnabled, {
    providerId: initialProviderId,
  });
  const providerConfigured =
    providers.find((provider) => provider.id === providerId)?.configured ?? false;
  const modelConfigured = providerConfigured && Boolean(model);

  useEffect(() => {
    let active = true;
    fetch(`/api/models?providerId=${encodeURIComponent(providerId)}`)
      .then(async (response) => {
        const result: unknown = await response.json();
        if (!response.ok) throw new Error("Could not load the current model catalog.");
        if (
          !result ||
          typeof result !== "object" ||
          !("models" in result) ||
          !Array.isArray(result.models)
        ) {
          throw new Error("The provider returned an invalid model catalog.");
        }
        return result.models as ModelDescriptor[];
      })
      .then((catalog) => {
        if (active) {
          setModels(catalog);
          setModelDiscoveryError(null);
        }
      })
      .catch((catalogError: unknown) => {
        if (active) {
          setModels([]);
          setModelDiscoveryError(
            catalogError instanceof Error ? catalogError.message : "Could not load models.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [providerId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const hour = new Date().getHours();
      setGreeting(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
      try {
        const saved = localStorage.getItem(`cosmos:pinned:${userId}`);
        const parsed: unknown = saved ? JSON.parse(saved) : [];
        if (Array.isArray(parsed) && parsed.every((id) => typeof id === "string")) {
          setPinnedIds(parsed);
        }
      } catch {
        setStatus("Pinned conversations are unavailable in this browser session.");
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [userId]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    setShowScrollButton(distanceFromBottom > 160);
    if (shouldAutoScroll.current) {
      element.scrollTo({
        top: element.scrollHeight,
        behavior: pending ? "auto" : "smooth",
      });
    }
  }, [messages, pending, error]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setSidebarOpen(false);
        setEditing(null);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        startNewChat();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // startNewChat is deliberately kept inside this listener so it does not rebind on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  function startNewChat() {
    if (pending) return;
    setActiveId(null);
    setMessages([]);
    setDraft("");
    setEditing(null);
    setError(null);
    setStatus(null);
    setFailedPrompt(null);
    setSidebarOpen(false);
    inputRef.current?.focus();
  }

  async function selectConversation(conversationId: string) {
    if (pending || conversationId === activeId) {
      setSidebarOpen(false);
      return;
    }
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}`);
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error?.message ?? "Could not load this conversation.");
      setActiveId(result.conversation.id);
      setMessages(result.messages);
      setEditing(null);
      setSidebarOpen(false);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Could not load this conversation.",
      );
    } finally {
      setPending(false);
    }
  }

  async function deleteConversation(conversationId: string) {
    if (pending || !window.confirm("Delete this conversation and its messages?")) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${conversationId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete this conversation.");
      setConversations((current) =>
        current.filter((conversation) => conversation.id !== conversationId),
      );
      const nextPinned = pinnedIds.filter((id) => id !== conversationId);
      setPinnedIds(nextPinned);
      localStorage.setItem(`cosmos:pinned:${userId}`, JSON.stringify(nextPinned));
      if (activeId === conversationId) {
        setActiveId(null);
        setMessages([]);
      }
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Could not delete this conversation.",
      );
    } finally {
      setPending(false);
    }
  }

  function togglePin(conversationId: string) {
    const nextPinned = pinnedIds.includes(conversationId)
      ? pinnedIds.filter((id) => id !== conversationId)
      : [...pinnedIds, conversationId];
    setPinnedIds(nextPinned);
    try {
      localStorage.setItem(`cosmos:pinned:${userId}`, JSON.stringify(nextPinned));
      setStatus(
        nextPinned.includes(conversationId)
          ? "Conversation pinned on this device."
          : "Pin removed.",
      );
    } catch {
      setStatus("This browser could not save pinned conversations.");
    }
  }

  async function sendPrompt(value: string, operation: SendOperation = {}, retry = false) {
    const text = value.trim();
    if (!text || pending || !modelConfigured || preferencePending) return;

    const previousStreamingId = streamingMessageId.current;
    const assistantId = crypto.randomUUID();
    streamingMessageId.current = assistantId;
    setError(null);
    setStatus(null);
    setFailedPrompt(null);
    setFailedOperation(operation);

    if (!retry && operation.editFromMessageId) {
      const index = messages.findIndex((message) => message.id === operation.editFromMessageId);
      if (index < 0) return;
      const editedUser: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        created_at: new Date().toISOString(),
      };
      setMessages([
        ...messages.slice(0, index),
        editedUser,
        { id: assistantId, role: "assistant", content: "", created_at: new Date().toISOString() },
      ]);
    } else if (!retry && operation.regenerate) {
      const priorMessages =
        messages.at(-1)?.role === "assistant" ? messages.slice(0, -1) : messages;
      setMessages([
        ...priorMessages,
        { id: assistantId, role: "assistant", content: "", created_at: new Date().toISOString() },
      ]);
    } else if (!retry) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: text,
          created_at: new Date().toISOString(),
        },
        { id: assistantId, role: "assistant", content: "", created_at: new Date().toISOString() },
      ]);
    } else {
      setMessages((current) => [
        ...current.filter((message) => message.id !== previousStreamingId),
        { id: assistantId, role: "assistant", content: "", created_at: new Date().toISOString() },
      ]);
    }

    setPending(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          conversationId: activeId ?? undefined,
          message: text,
          ...operation,
        }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message ?? "The model could not complete this request.");
      }

      const conversationId = await consumeChatStream(
        response,
        (delta) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content + delta }
                : message,
            ),
          );
        },
        (event) => {
          if (event.type === "model" && event.fallbackUsed) {
            setStatus(`Using fallback model ${event.target.modelId}.`);
          } else if (event.type === "usage") {
            setStatus(`Last response used ${event.usage.totalTokens.toLocaleString()} tokens.`);
          }
        },
      );
      setActiveId(conversationId);
      const title = text.slice(0, 80) || "New conversation";
      setConversations((current) => {
        const existing = current.find((conversation) => conversation.id === conversationId);
        const updated: Conversation = {
          id: conversationId,
          title: existing?.title ?? title,
          updated_at: new Date().toISOString(),
        };
        return [updated, ...current.filter((conversation) => conversation.id !== conversationId)];
      });
      setEditing(null);
    } catch (requestError) {
      if (controller.signal.aborted) {
        setStatus("Generation stopped. The partial reply was not saved.");
      } else {
        setMessages((current) => current.filter((message) => message.id !== assistantId));
        setError(
          requestError instanceof Error ? requestError.message : "A connection error occurred.",
        );
        setFailedPrompt(text);
        setFailedOperation(operation);
      }
    } finally {
      abortRef.current = null;
      setPending(false);
      streamingMessageId.current = null;
    }
  }

  function stopGeneration() {
    abortRef.current?.abort();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preferencePending) return;
    const text = draft;
    if (!text.trim()) return;
    setDraft("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    const operation = editing ? { editFromMessageId: editing.id } : {};
    setEditing(null);
    void sendPrompt(text, operation);
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function beginEdit(message: ChatMessage) {
    if (pending) return;
    setEditing({ id: message.id, content: message.content });
    setDraft(message.content);
    inputRef.current?.focus();
  }

  async function copyMessage(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId(null), 1400);
    } catch {
      setError("Clipboard access is unavailable in this browser.");
    }
  }

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleConversations = conversations.filter((conversation) =>
    conversation.title.toLocaleLowerCase().includes(normalizedSearch),
  );
  const pinnedConversations = visibleConversations.filter((conversation) =>
    pinnedIds.includes(conversation.id),
  );
  const recentConversations = visibleConversations.filter(
    (conversation) => !pinnedIds.includes(conversation.id),
  );
  const activeTitle =
    conversations.find((conversation) => conversation.id === activeId)?.title ?? "New conversation";

  return (
    <div className="app-shell cosmos-app-shell">
      <aside
        className={`sidebar cosmos-sidebar${sidebarOpen ? " open" : ""}`}
        aria-label="Main navigation"
      >
        <Link className="sidebar-brand" href="/chat">
          <span className="brand-mark">
            <CosmosMark size={26} />
          </span>
          <span className="brand-copy">
            <strong>COSMOS</strong>
            <small>SUPER INTELLIGENCE</small>
          </span>
        </Link>

        <nav className="sidebar-nav" aria-label="Primary routes">
          <Link className="sidebar-nav-item active" href="/chat">
            Intelligence
          </Link>
          <Link className="sidebar-nav-item" href="/dashboard">
            Dashboard
          </Link>
          <Link className="sidebar-nav-item" href="/settings">
            System
          </Link>
        </nav>

        <button className="sidebar-new" type="button" onClick={startNewChat} disabled={pending}>
          <MessageSquarePlus size={16} aria-hidden="true" /> New conversation
        </button>

        <label className="conversation-search">
          <Search size={15} aria-hidden="true" />
          <input
            ref={searchRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
          />
        </label>

        <div className="workspace-switcher" aria-label="Current workspace">
          <span className="workspace-glyph">P</span>
          <span>
            <strong>Personal</strong>
            <small>Workspace</small>
          </span>
          <span className="workspace-status">ACTIVE</span>
        </div>

        <nav className="conversation-list" aria-label="Conversation history">
          {pinnedConversations.length > 0 && (
            <ConversationSection
              label="PINNED"
              conversations={pinnedConversations}
              activeId={activeId}
              pinnedIds={pinnedIds}
              pending={pending}
              onSelect={selectConversation}
              onDelete={deleteConversation}
              onPin={togglePin}
            />
          )}
          <ConversationSection
            label={search ? "SEARCH RESULTS" : "RECENTS"}
            conversations={recentConversations}
            activeId={activeId}
            pinnedIds={pinnedIds}
            pending={pending}
            onSelect={selectConversation}
            onDelete={deleteConversation}
            onPin={togglePin}
          />
          {visibleConversations.length === 0 && (
            <p className="sidebar-empty">
              {search
                ? "No conversations match that search."
                : "Your conversations will appear here."}
            </p>
          )}
        </nav>

        <div className="sidebar-capabilities">
          <span className="sidebar-section-label">WORKSPACE</span>
          <div className="capability-row">
            <FilePlus2 size={15} />
            <span>Memory</span>
            <small>Adaptive</small>
          </div>
          <div className="capability-row">
            <Wrench size={15} />
            <span>SI Tools</span>
            <small>{calculatorEnabled ? "Enabled" : "Standby"}</small>
          </div>
          <span className="capability-note">
            Saved memories are optional and remain under your control.
          </span>
        </div>

        <div className="sidebar-bottom">
          <Link className="sidebar-link" href="/settings" onClick={() => setSidebarOpen(false)}>
            <Settings2 size={15} aria-hidden="true" /> Settings and memory
          </Link>
          <div className="sidebar-user">
            <span className="sidebar-user-mark" aria-hidden="true">
              {userEmail.slice(0, 1).toUpperCase()}
            </span>
            <span className="sidebar-user-email" title={userEmail}>
              {userEmail}
            </span>
            <form action={signOutAction}>
              <button
                className="sidebar-signout"
                type="submit"
                aria-label="Sign out"
                title="Sign out"
              >
                <ArrowUpRight size={15} />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <button
        className={`mobile-scrim${sidebarOpen ? " visible" : ""}`}
        type="button"
        aria-label="Close navigation"
        onClick={() => setSidebarOpen(false)}
      />

      <main className="main-panel cosmos-main-panel">
        <header className="topbar cosmos-topbar">
          <button
            className="mobile-menu"
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={17} />
          </button>
          <div className="topbar-title">
            <span className="eyebrow">COSMOS · SUPER INTELLIGENCE</span>
            <h1>{activeTitle}</h1>
          </div>
          <label className="model-selector-label">
            <span className="model-dot" />
            <select
              className="model-selector"
              aria-label="Select COSMOS model"
              value={model}
              disabled={!models.length || preferencePending || pending}
              onChange={(event) => void updatePreferences({ preferredModel: event.target.value })}
            >
              {!model && <option value="">Select a model</option>}
              {model && !models.some((item) => item.id === model) && (
                <option value={model}>{model} (saved)</option>
              )}
              {models.length ? (
                models.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))
              ) : (
                <option value="">{modelDiscoveryError ?? "Loading model catalog…"}</option>
              )}
            </select>
          </label>
        </header>

        {!providerConfigured && (
          <div className="config-banner" role="status">
            Configure the selected provider on the server to enable model replies.
          </div>
        )}
        {modelConfigured && !model && (
          <div className="config-banner" role="status">
            Select a model in AI settings before starting a conversation.
          </div>
        )}
        {preferenceError && (
          <p className="workspace-error" role="alert">
            {preferenceError}
          </p>
        )}

        <div
          className="chat-scroll cosmos-chat-scroll"
          ref={scrollRef}
          aria-label="Chat messages"
          onScroll={() => {
            const element = scrollRef.current;
            if (!element) return;
            const distanceFromBottom =
              element.scrollHeight - element.scrollTop - element.clientHeight;
            shouldAutoScroll.current = distanceFromBottom < 160;
            setShowScrollButton(distanceFromBottom > 160);
          }}
        >
          {messages.length === 0 ? (
            <section className="welcome cosmos-welcome">
              <div className="welcome-mark">
                <Sparkles size={21} aria-hidden="true" />
              </div>
              <p className="welcome-kicker">COSMOS INTELLIGENCE</p>
              <h2>
                {greeting},<br />
                <em>{userEmail.split("@")[0] || "there"}.</em>
              </h2>
              <p className="welcome-copy">
                Bring a question, a rough idea, or a complex problem. Start anywhere.
              </p>
              <div className="suggestions" aria-label="Suggested prompts">
                {suggestions.map((suggestion, index) => (
                  <button
                    className="suggestion"
                    key={suggestion}
                    type="button"
                    onClick={() => void sendPrompt(suggestion)}
                    disabled={!modelConfigured || pending}
                  >
                    <span className="suggestion-index">0{index + 1}</span>
                    <span className="suggestion-text">{suggestion}</span>
                    <ArrowUpRight className="suggestion-arrow" size={15} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <div
              className="message-list cosmos-message-list"
              role="log"
              aria-live="polite"
              aria-relevant="additions text"
            >
              <AnimatePresence initial={false}>
                {messages.map((message, index) => {
                  const isLatestAssistant =
                    message.role === "assistant" && index === messages.length - 1;
                  const isStreaming = pending && message.id === streamingMessageId.current;
                  return (
                    <motion.article
                      className={`chat-message ${message.role} cosmos-message`}
                      key={message.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18 }}
                    >
                      <span className="message-avatar" aria-hidden="true">
                        {message.role === "assistant" ? <Sparkles size={14} /> : "YOU"}
                      </span>
                      <div className="message-body">
                        <div className="message-heading">
                          <div className="message-label">
                            {message.role === "assistant" ? "COSMOS" : "YOU"}
                          </div>
                          {!pending && (
                            <div className="message-actions">
                              {message.role === "user" && (
                                <button
                                  type="button"
                                  onClick={() => beginEdit(message)}
                                  title="Edit and resend"
                                  aria-label="Edit message"
                                >
                                  <Pencil size={14} />
                                </button>
                              )}
                              {message.role === "assistant" && (
                                <button
                                  type="button"
                                  onClick={() => void copyMessage(message)}
                                  title="Copy response"
                                  aria-label="Copy response"
                                >
                                  {copiedId === message.id ? (
                                    <Check size={14} />
                                  ) : (
                                    <Copy size={14} />
                                  )}
                                </button>
                              )}
                              {isLatestAssistant && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void sendPrompt(findLatestUserMessage(messages), {
                                      regenerate: true,
                                    })
                                  }
                                  title="Regenerate response"
                                  aria-label="Regenerate response"
                                  disabled={!modelConfigured}
                                >
                                  <RotateCcw size={14} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        {message.role === "assistant" ? (
                          message.content ? (
                            <MarkdownMessage content={message.content} />
                          ) : isStreaming ? (
                            <span className="stream-caret" aria-label="COSMOS is responding" />
                          ) : (
                            <span className="typing-indicator">
                              <i />
                              <i />
                              <i />
                            </span>
                          )
                        ) : editing?.id === message.id ? (
                          <p className="message-content">{message.content}</p>
                        ) : (
                          <div className="message-content">{message.content}</div>
                        )}
                      </div>
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
          {error && (
            <div className="message-error" role="alert">
              {error}
              {failedPrompt && modelConfigured && (
                <div>
                  <button
                    type="button"
                    onClick={() => void sendPrompt(failedPrompt, failedOperation, true)}
                    disabled={pending}
                  >
                    Retry response
                  </button>
                </div>
              )}
            </div>
          )}
          {status && (
            <p className="workspace-status-message" role="status">
              {status}
            </p>
          )}
        </div>

        {showScrollButton && (
          <button
            className="scroll-bottom-button"
            type="button"
            onClick={() =>
              scrollRef.current?.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: "smooth",
              })
            }
            aria-label="Scroll to latest message"
          >
            <ArrowDown size={15} />
          </button>
        )}

        <section className="composer-area cosmos-composer-area" aria-label="Write a message">
          {editing && (
            <div className="editing-banner">
              <span>Editing a message. Resending creates a new conversation branch.</span>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setDraft("");
                }}
                aria-label="Cancel edit"
              >
                <X size={14} />
              </button>
            </div>
          )}
          <form className="composer cosmos-composer" onSubmit={submit}>
            <label className="sr-only" htmlFor="chat-message">
              Message COSMOS
            </label>
            <textarea
              ref={inputRef}
              id="chat-message"
              rows={2}
              maxLength={8000}
              placeholder={
                modelConfigured
                    ? "Message COSMOS..."
                  : "Configure OpenRouter to start a conversation"
              }
              value={draft}
              disabled={pending || !modelConfigured}
              onChange={(event) => {
                setDraft(event.target.value);
                event.target.style.height = "auto";
                event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`;
              }}
              onKeyDown={handleInputKeyDown}
              required
            />
            <div className="composer-footer">
              <div className="composer-tools">
                <button
                  className="composer-icon-button"
                  type="button"
                  disabled
                  title="File uploads are not available yet"
                  aria-label="Attach file (not available yet)"
                >
                  <Paperclip size={16} />
                </button>
                <label
                  className="calculator-choice"
                  title="Allow this model request to use arithmetic only"
                >
                  <input
                    type="checkbox"
                    checked={calculatorEnabled}
                    disabled={preferencePending || pending}
                    onChange={(event) =>
                      void updatePreferences({ calculatorEnabled: event.target.checked })
                    }
                  />
                  <Wrench size={13} aria-hidden="true" /> Calculator
                </label>
                <span className="provider-caption">OpenRouter</span>
              </div>
              <div className="composer-submit-group">
                {pending ? (
                  <button
                    className="stop-button"
                    type="button"
                    onClick={stopGeneration}
                    aria-label="Stop generation"
                    title="Stop generation"
                  >
                    <Square size={13} fill="currentColor" /> Stop
                  </button>
                ) : (
                  <button
                    className="send-button"
                    type="submit"
                    disabled={!modelConfigured || !draft.trim() || preferencePending}
                    aria-label="Send message"
                  >
                    <span>{editing ? "Resend" : "Send"}</span>
                    <Send size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          </form>
          <p className="privacy-note">
            Your leadership workspace is protected by account isolation. SI requests are sent to the
            configured provider only.
          </p>
        </section>
      </main>
    </div>
  );
}

function findLatestUserMessage(messages: ChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
}

function ConversationSection({
  label,
  conversations,
  activeId,
  pinnedIds,
  pending,
  onSelect,
  onDelete,
  onPin,
}: {
  label: string;
  conversations: Conversation[];
  activeId: string | null;
  pinnedIds: string[];
  pending: boolean;
  onSelect: (id: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onPin: (id: string) => void;
}) {
  if (!conversations.length) return null;
  return (
    <section className="conversation-group">
      <div className="sidebar-section-label">{label}</div>
      {conversations.map((conversation) => {
        const pinned = pinnedIds.includes(conversation.id);
        return (
          <div
            className={`conversation-row${conversation.id === activeId ? " active" : ""}`}
            key={conversation.id}
          >
            <button
              className="conversation-select"
              type="button"
              disabled={pending}
              onClick={() => void onSelect(conversation.id)}
              title={conversation.title}
            >
              {conversation.title}
            </button>
            <div className="conversation-actions">
              <button
                type="button"
                disabled={pending}
                onClick={() => onPin(conversation.id)}
                aria-label={pinned ? "Unpin conversation" : "Pin conversation"}
                title={pinned ? "Unpin" : "Pin"}
              >
                {pinned ? <PinOff size={13} /> : <Pin size={13} />}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void onDelete(conversation.id)}
                aria-label={`Delete ${conversation.title}`}
                title="Delete conversation"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
