const HISTORY_KEY = "cosmos.remember.v1";
const CONVERSATIONS_KEY = "cosmos.conversations.v1";

const elements = {
  chatScroll: document.querySelector("#chat-scroll"),
  clearHistory: document.querySelector("#clear-history"),
  composer: document.querySelector("#composer"),
  conversationList: document.querySelector("#conversation-list"),
  conversationTitle: document.querySelector("#conversation-title"),
  emptyHistory: document.querySelector("#empty-history"),
  input: document.querySelector("#message-input"),
  messages: document.querySelector("#messages"),
  modelStatus: document.querySelector("#model-status"),
  modelStatusText: document.querySelector("#model-status-text"),
  mobileBackdrop: document.querySelector("#mobile-backdrop"),
  mobileHistory: document.querySelector("#mobile-history"),
  newChat: document.querySelector("#new-chat"),
  rememberHistory: document.querySelector("#remember-history"),
  sendButton: document.querySelector("#send-button"),
  sidebar: document.querySelector("#sidebar"),
  welcome: document.querySelector("#welcome"),
};

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    elements.modelStatusText.textContent = "Device storage unavailable";
  }
}

let rememberHistory = readStorage(HISTORY_KEY) === "true";
let conversations = rememberHistory ? readConversations() : [];
let activeConversationId = conversations[0]?.id ?? null;
let pendingConversationId = null;

function readConversations() {
  try {
    const saved = JSON.parse(readStorage(CONVERSATIONS_KEY) ?? "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter((conversation) =>
      conversation && typeof conversation.id === "string" && Array.isArray(conversation.messages)
      && conversation.messages.every((message) => message && ["user", "assistant"].includes(message.role)
        && typeof message.content === "string" && message.content.length <= 6000),
    );
  } catch {
    return [];
  }
}

function persistConversations() {
  if (!rememberHistory) return;
  try {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
  } catch {
    elements.modelStatusText.textContent = "Device storage is full";
  }
}

function currentConversation() {
  return conversations.find((conversation) => conversation.id === activeConversationId) ?? null;
}

function createConversation() {
  const conversation = {
    id: crypto.randomUUID(),
    messages: [],
    title: "New conversation",
  };
  conversations.unshift(conversation);
  activeConversationId = conversation.id;
  persistConversations();
  render();
  elements.input.focus();
  return conversation;
}

function titleFor(conversation) {
  const firstUserMessage = conversation.messages.find((message) => message.role === "user");
  if (!firstUserMessage) return "New conversation";
  return firstUserMessage.content.replace(/\s+/g, " ").slice(0, 44) || "New conversation";
}

function renderSidebar() {
  elements.conversationList.replaceChildren();
  elements.emptyHistory.hidden = conversations.length > 0;

  for (const conversation of conversations) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `conversation-item${conversation.id === activeConversationId ? " active" : ""}`;
    button.textContent = titleFor(conversation);
    button.title = button.textContent;
    button.addEventListener("click", () => {
      activeConversationId = conversation.id;
      closeSidebar();
      render();
    });
    elements.conversationList.append(button);
  }
}

function renderMessages() {
  const conversation = currentConversation();
  const messages = conversation?.messages ?? [];
  elements.welcome.hidden = messages.length > 0;
  elements.messages.hidden = messages.length === 0;
  elements.messages.replaceChildren();
  elements.conversationTitle.textContent = conversation ? titleFor(conversation) : "New conversation";

  for (const message of messages) {
    const row = document.createElement("article");
    row.className = `message ${message.role}`;

    const avatar = document.createElement("span");
    avatar.className = "message-avatar";
    avatar.textContent = message.role === "assistant" ? "C" : "YOU";
    avatar.setAttribute("aria-hidden", "true");

    const body = document.createElement("div");
    body.className = "message-body";
    const label = document.createElement("div");
    label.className = "message-label";
    label.textContent = message.role === "assistant" ? "COSMOS" : "YOU";
    const content = document.createElement("div");
    content.className = "message-content";
    content.textContent = message.content;
    body.append(label, content);
    row.append(avatar, body);
    elements.messages.append(row);
  }

  if (pendingConversationId === activeConversationId) {
    const row = document.createElement("article");
    row.className = "message assistant";
    row.innerHTML = '<span class="message-avatar" aria-hidden="true">C</span><div class="message-body"><div class="message-label">COSMOS</div><span class="thinking-dots" aria-label="COSMOS is thinking"><i></i><i></i><i></i></span></div>';
    elements.messages.append(row);
  }

  elements.chatScroll.scrollTop = elements.chatScroll.scrollHeight;
}

function render() {
  renderSidebar();
  renderMessages();
  elements.rememberHistory.checked = rememberHistory;
  elements.sendButton.disabled = pendingConversationId !== null;
  elements.input.disabled = pendingConversationId !== null;
}

function appendError(message, conversation) {
  if (currentConversation()?.id !== conversation.id) return;
  const error = document.createElement("div");
  error.className = "message-error";
  const detail = document.createElement("div");
  detail.textContent = message;
  const retry = document.createElement("button");
  retry.className = "retry-button";
  retry.type = "button";
  retry.textContent = "Try again";
  retry.addEventListener("click", () => requestReply(conversation));
  error.append(detail, retry);
  elements.messages.append(error);
  elements.messages.hidden = false;
  elements.chatScroll.scrollTop = elements.chatScroll.scrollHeight;
}

async function requestReply(conversation) {
  if (pendingConversationId !== null) return;
  pendingConversationId = conversation.id;
  render();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: conversation.messages.slice(-12) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail ?? "The model could not complete this request.");
    conversation.messages.push({ role: "assistant", content: result.reply });
    persistConversations();
  } catch (error) {
    pendingConversationId = null;
    render();
    appendError(error instanceof Error ? error.message : "A connection error occurred.", conversation);
    return;
  }

  pendingConversationId = null;
  render();
}

async function sendMessage(value) {
  const text = value.trim();
  if (!text || pendingConversationId !== null) return;
  const conversation = currentConversation() ?? createConversation();
  conversation.messages.push({ role: "user", content: text });
  persistConversations();
  render();
  elements.input.value = "";
  resizeInput();
  await requestReply(conversation);
}

function resizeInput() {
  elements.input.style.height = "auto";
  elements.input.style.height = `${Math.min(elements.input.scrollHeight, 160)}px`;
}

function closeSidebar() {
  elements.sidebar.classList.remove("open");
  elements.mobileBackdrop.classList.remove("visible");
  elements.mobileHistory.setAttribute("aria-expanded", "false");
}

elements.composer.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(elements.input.value);
});

elements.input.addEventListener("input", resizeInput);
elements.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    elements.composer.requestSubmit();
  }
});

elements.newChat.addEventListener("click", () => createConversation());
elements.rememberHistory.addEventListener("change", () => {
  rememberHistory = elements.rememberHistory.checked;
  try {
    localStorage.setItem(HISTORY_KEY, String(rememberHistory));
  } catch {
    elements.modelStatusText.textContent = "Device storage unavailable";
    elements.rememberHistory.checked = false;
    rememberHistory = false;
  }
  if (rememberHistory) persistConversations();
  else removeStorage(CONVERSATIONS_KEY);
});

elements.clearHistory.addEventListener("click", () => {
  if (!window.confirm("Clear all saved conversations from this browser?")) return;
  conversations = [];
  activeConversationId = null;
  removeStorage(CONVERSATIONS_KEY);
  render();
});

elements.mobileHistory.addEventListener("click", () => {
  const isOpen = elements.sidebar.classList.toggle("open");
  elements.mobileBackdrop.classList.toggle("visible", isOpen);
  elements.mobileHistory.setAttribute("aria-expanded", String(isOpen));
});
elements.mobileBackdrop.addEventListener("click", closeSidebar);

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => sendMessage(button.dataset.prompt));
});

fetch("/api/status")
  .then((response) => response.json())
  .then((status) => {
    elements.modelStatus.classList.toggle("ready", status.configured);
    elements.modelStatusText.textContent = status.configured ? status.model : "Model not configured";
  })
  .catch(() => {
    elements.modelStatusText.textContent = "Model status unavailable";
  });

render();