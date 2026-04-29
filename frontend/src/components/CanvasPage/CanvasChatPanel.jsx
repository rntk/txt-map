import React, { useCallback, useState } from "react";
import ChatHistory from "./ChatHistory";
import CanvasChatHistoryPanel from "./CanvasChatHistoryPanel";

/**
 * @typedef {import("./useCanvasChats").CanvasChatSummary} CanvasChatSummary
 */

/**
 * @param {{
 *   articleId: string,
 *   chatId: string|null,
 *   chats: CanvasChatSummary[],
 *   isChatsLoading: boolean,
 *   chatsError: string|null,
 *   onSelectChat: (chatId: string) => void,
 *   onDeleteChat: (chatId: string) => void,
 *   onNewChat: () => void,
 *   onChatPersisted: (chatId: string, lastMessage: string) => void,
 *   messages: {role: string, content: string}[],
 *   setMessages: React.Dispatch<React.SetStateAction<{role: string, content: string}[]>>,
 *   isChatLoading: boolean,
 *   setIsChatLoading: (loading: boolean) => void,
 *   contextPages: string,
 *   setContextPages: (pages: string) => void,
 *   articlePages: Array<unknown>,
 *   fetchEvents: () => void,
 * }} props
 */
export default function CanvasChatPanel({
  articleId,
  chatId,
  chats,
  isChatsLoading,
  chatsError,
  onSelectChat,
  onDeleteChat,
  onNewChat,
  onChatPersisted,
  messages,
  setMessages,
  isChatLoading,
  setIsChatLoading,
  contextPages,
  setContextPages,
  articlePages,
  fetchEvents,
}) {
  const [inputValue, setInputValue] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const handleSend = useCallback(async () => {
    const msg = inputValue.trim();
    if (!msg || isChatLoading) return;

    setInputValue("");
    const history = messages;
    const newHistory = [...history, { role: "user", content: msg }];
    setMessages(newHistory);
    setIsChatLoading(true);

    /** @type {number[] | null} */
    let parsedPages = null;
    if (contextPages.trim()) {
      const maxPage = articlePages.length;
      const seen = new Set();
      parsedPages = contextPages
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => {
          if (isNaN(n) || n <= 0) return false;
          if (maxPage > 0 && n > maxPage) return false;
          if (seen.has(n)) return false;
          seen.add(n);
          return true;
        });
      if (parsedPages.length === 0) {
        parsedPages = null;
      }
    }

    const controller = new AbortController();

    try {
      const r = await fetch(`/api/canvas/${articleId}/chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          history,
          pages: parsedPages,
          chat_id: chatId || null,
        }),
        signal: controller.signal,
      });

      const text = await r.text();
      /** @type {{request_id?: string, reply?: string, detail?: string, chat_id?: string}} */
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = {};
        }
      }

      if (!r.ok) {
        throw new Error(data.detail || `HTTP ${r.status}`);
      }

      if (data.chat_id) {
        onChatPersisted(data.chat_id, msg);
      }

      const reply = data.request_id
        ? await pollCanvasChatReply(
            articleId,
            data.request_id,
            controller.signal,
          )
        : data.reply || "";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error("Canvas chat failed", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to get a response." },
      ]);
    } finally {
      if (!controller.signal.aborted) {
        setIsChatLoading(false);
        setTimeout(fetchEvents, 300);
      }
    }
  }, [
    articleId,
    chatId,
    inputValue,
    isChatLoading,
    messages,
    fetchEvents,
    contextPages,
    articlePages,
    setMessages,
    setIsChatLoading,
    onChatPersisted,
  ]);

  const handleNewChat = useCallback(() => {
    if (isChatLoading) return;
    onNewChat();
    setInputValue("");
    setShowHistory(false);
  }, [isChatLoading, onNewChat]);

  /**
   * @param {React.KeyboardEvent<HTMLTextAreaElement>} e
   */
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  /**
   * @param {string} selectedChatId
   */
  const handleSelectFromHistory = useCallback(
    (selectedChatId) => {
      onSelectChat(selectedChatId);
      setShowHistory(false);
    },
    [onSelectChat],
  );

  return (
    <div className="canvas-tab-content is-active">
      <div className="canvas-chat-header">
        <span>Article Assistant</span>
        <div className="canvas-chat-header-actions">
          <button
            type="button"
            className={`canvas-chat-history-toggle${showHistory ? " is-active" : ""}`}
            onClick={() => setShowHistory((v) => !v)}
            title="Show chat history"
            aria-pressed={showHistory}
          >
            History
          </button>
          <button
            type="button"
            className="canvas-chat-new"
            onClick={handleNewChat}
            disabled={isChatLoading}
            title="Start a new chat"
          >
            New Chat
          </button>
        </div>
      </div>
      {showHistory && (
        <CanvasChatHistoryPanel
          chats={chats}
          activeChatId={chatId}
          isLoading={isChatsLoading}
          error={chatsError}
          onSelectChat={handleSelectFromHistory}
          onDeleteChat={onDeleteChat}
          onNewChat={handleNewChat}
          onClose={() => setShowHistory(false)}
        />
      )}
      <div className="canvas-chat-context-limiter">
        <label htmlFor="context-pages-input">Context pages:</label>
        <input
          id="context-pages-input"
          className="canvas-chat-context-pages-input"
          type="text"
          placeholder="e.g. 1,3,5 (all if empty)"
          value={contextPages}
          onChange={(e) => setContextPages(e.target.value)}
          disabled={isChatLoading}
        />
      </div>
      <ChatHistory messages={messages} isLoading={isChatLoading} />
      <div className="canvas-chat-input-row">
        <textarea
          className="canvas-chat-input"
          placeholder="Ask about this article…"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={isChatLoading}
        />
        <button
          type="button"
          className="canvas-chat-send"
          onClick={handleSend}
          disabled={!inputValue.trim() || isChatLoading}
        >
          Send
        </button>
      </div>
    </div>
  );
}

async function pollCanvasChatReply(articleId, requestId, signal) {
  const POLL_INTERVAL_MS = 2000;
  const CHAT_POLL_MAX_ATTEMPTS = 150;

  for (let attempt = 0; attempt < CHAT_POLL_MAX_ATTEMPTS; attempt++) {
    const response = await fetch(`/api/canvas/${articleId}/chat/${requestId}`, {
      credentials: "include",
      signal,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text || "{}") : {};

    if (!response.ok) {
      throw new Error(data.detail || `HTTP ${response.status}`);
    }
    if (data.status === "completed") {
      return data.reply || "";
    }
    if (data.status === "failed") {
      throw new Error(data.error || "Error");
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error("Chat response timed out.");
}
