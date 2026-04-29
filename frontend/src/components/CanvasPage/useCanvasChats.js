import { useCallback, useEffect, useRef, useState } from "react";

/**
 * @typedef {Object} CanvasChatSummary
 * @property {string} chat_id
 * @property {string} article_id
 * @property {string} title
 * @property {string} created_at
 * @property {string} updated_at
 * @property {number} message_count
 * @property {number} event_count
 */

/**
 * @typedef {Object} CanvasChatMessage
 * @property {"user"|"assistant"} role
 * @property {string} content
 * @property {string=} ts
 */

/**
 * Hook that manages canvas chat sessions for a given article.
 * Provides chat list/create/delete and tracks the active chat id.
 *
 * @param {string} articleId
 * @returns {{
 *   chats: CanvasChatSummary[],
 *   activeChatId: string|null,
 *   isLoading: boolean,
 *   error: string|null,
 *   refreshChats: () => Promise<void>,
 *   selectChat: (chatId: string|null) => Promise<CanvasChatMessage[]>,
 *   createChat: () => Promise<string|null>,
 *   deleteChat: (chatId: string) => Promise<boolean>,
 *   setActiveChatId: (chatId: string|null) => void,
 *   touchChatPreview: (chatId: string, lastMessage: string) => void,
 * }}
 */
export function useCanvasChats(articleId) {
  /** @type {[CanvasChatSummary[], React.Dispatch<React.SetStateAction<CanvasChatSummary[]>>]} */
  const [chats, setChats] = useState([]);
  /** @type {[string|null, React.Dispatch<React.SetStateAction<string|null>>]} */
  const [activeChatId, setActiveChatId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  /** @type {[string|null, React.Dispatch<React.SetStateAction<string|null>>]} */
  const [error, setError] = useState(null);

  const ensuredInitialRef = useRef(false);

  const refreshChats = useCallback(async () => {
    if (!articleId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/canvas/${articleId}/chats`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const list = Array.isArray(data?.chats) ? data.chats : [];
      setChats(list);
    } catch (err) {
      console.error("Failed to load chats", err);
      setError(err?.message || "Failed to load chats");
    } finally {
      setIsLoading(false);
    }
  }, [articleId]);

  /**
   * @param {string} title
   * @returns {Promise<string|null>}
   */
  const createChat = useCallback(
    async (title) => {
      if (!articleId) return null;
      setError(null);
      try {
        const response = await fetch(`/api/canvas/${articleId}/chats`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title || null }),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const chat = data?.chat;
        if (!chat || !chat.chat_id) return null;
        setChats((prev) => [
          chat,
          ...prev.filter((c) => c.chat_id !== chat.chat_id),
        ]);
        setActiveChatId(chat.chat_id);
        return chat.chat_id;
      } catch (err) {
        console.error("Failed to create chat", err);
        setError(err?.message || "Failed to create chat");
        return null;
      }
    },
    [articleId],
  );

  /**
   * @param {string} chatId
   * @returns {Promise<boolean>}
   */
  const deleteChat = useCallback(
    async (chatId) => {
      if (!articleId || !chatId) return false;
      setError(null);
      try {
        const response = await fetch(
          `/api/canvas/${articleId}/chats/${chatId}`,
          { method: "DELETE", credentials: "include" },
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        setChats((prev) => prev.filter((c) => c.chat_id !== chatId));
        setActiveChatId((current) => (current === chatId ? null : current));
        return true;
      } catch (err) {
        console.error("Failed to delete chat", err);
        setError(err?.message || "Failed to delete chat");
        return false;
      }
    },
    [articleId],
  );

  /**
   * Switch to an existing chat and load its persisted messages.
   * Returns the list of messages (user/assistant) for the chat.
   * @param {string|null} chatId
   * @returns {Promise<CanvasChatMessage[]>}
   */
  const selectChat = useCallback(
    async (chatId) => {
      if (!articleId || !chatId) {
        setActiveChatId(null);
        return [];
      }
      setError(null);
      try {
        const response = await fetch(
          `/api/canvas/${articleId}/chats/${chatId}`,
          { credentials: "include" },
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        setActiveChatId(chatId);
        const messages = Array.isArray(data?.messages) ? data.messages : [];
        return messages.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: typeof m.content === "string" ? m.content : "",
          ts: m.ts,
        }));
      } catch (err) {
        console.error("Failed to load chat", err);
        setError(err?.message || "Failed to load chat");
        return [];
      }
    },
    [articleId],
  );

  // Update chat list metadata locally without an extra round-trip when a new
  // user message is sent (keeps the History list ordering responsive).
  const touchChatPreview = useCallback((chatId, lastMessage) => {
    if (!chatId) return;
    setChats((prev) => {
      const idx = prev.findIndex((c) => c.chat_id === chatId);
      const now = new Date().toISOString();
      if (idx === -1) return prev;
      const updated = {
        ...prev[idx],
        title:
          prev[idx].title && prev[idx].title !== "New chat"
            ? prev[idx].title
            : (lastMessage || prev[idx].title || "New chat").slice(0, 60),
        updated_at: now,
        message_count: (prev[idx].message_count || 0) + 1,
      };
      const next = [updated, ...prev.filter((_, i) => i !== idx)];
      return next;
    });
  }, []);

  // Initial load: fetch chats and ensure we have an active chat to start with.
  useEffect(() => {
    if (!articleId) return;
    ensuredInitialRef.current = false;
    refreshChats();
  }, [articleId, refreshChats]);

  useEffect(() => {
    if (!articleId) return;
    if (isLoading) return;
    if (activeChatId) return;
    if (ensuredInitialRef.current) return;
    ensuredInitialRef.current = true;
    if (chats.length > 0) {
      setActiveChatId(chats[0].chat_id);
    } else {
      // Auto-create first chat for this article so events have a place to go.
      createChat();
    }
  }, [articleId, isLoading, activeChatId, chats, createChat]);

  return {
    chats,
    activeChatId,
    isLoading,
    error,
    refreshChats,
    selectChat,
    createChat,
    deleteChat,
    setActiveChatId,
    touchChatPreview,
  };
}
