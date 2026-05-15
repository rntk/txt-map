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
 * Builds the updated chats list when a chat preview is touched.
 * @param {CanvasChatSummary[]} prev
 * @param {string} chatId
 * @param {string} lastMessage
 * @param {string} articleId
 * @returns {CanvasChatSummary[]}
 */
function buildTouchedChatsList(prev, chatId, lastMessage, articleId) {
  const idx = prev.findIndex((c) => c.chat_id === chatId);
  const now = new Date().toISOString();
  const title = (lastMessage || "New chat").slice(0, 60);
  if (idx === -1) {
    return [
      {
        chat_id: chatId,
        article_id: articleId,
        title,
        created_at: now,
        updated_at: now,
        message_count: 1,
        event_count: 0,
      },
      ...prev,
    ];
  }
  const updated = {
    ...prev[idx],
    title:
      prev[idx].title && prev[idx].title !== "New chat"
        ? prev[idx].title
        : title,
    updated_at: now,
    message_count: (prev[idx].message_count || 0) + 1,
  };
  return [updated, ...prev.filter((_, i) => i !== idx)];
}

/**
 * Sub-hook: handles fetching and deleting chats.
 * @param {string} articleId
 */
function useChatsApi(articleId) {
  const [chats, setChats] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedChats, setHasLoadedChats] = useState(false);
  const [error, setError] = useState(null);

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
      setHasLoadedChats(true);
      setIsLoading(false);
    }
  }, [articleId]);

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
        return true;
      } catch (err) {
        console.error("Failed to delete chat", err);
        setError(err?.message || "Failed to delete chat");
        return false;
      }
    },
    [articleId],
  );

  return {
    chats,
    setChats,
    isLoading,
    hasLoadedChats,
    setHasLoadedChats,
    error,
    setError,
    refreshChats,
    deleteChat,
  };
}

/**
 * Sub-hook: loads messages for a single chat session.
 * @param {string} articleId
 * @param {React.Dispatch<React.SetStateAction<string|null>>} setActiveChatId
 * @param {React.Dispatch<React.SetStateAction<string|null>>} setError
 */
function useSelectChat(articleId, setActiveChatId, setError) {
  return useCallback(
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
    [articleId, setActiveChatId, setError],
  );
}

/**
 * Hook that manages canvas chat sessions for a given article.
 * Provides chat list/delete and tracks the active chat id.
 *
 * @param {string} articleId
 * @returns {{
 *   chats: CanvasChatSummary[],
 *   activeChatId: string|null,
 *   isLoading: boolean,
 *   error: string|null,
 *   refreshChats: () => Promise<void>,
 *   selectChat: (chatId: string|null) => Promise<CanvasChatMessage[]>,
 *   deleteChat: (chatId: string) => Promise<boolean>,
 *   setActiveChatId: (chatId: string|null) => void,
 *   touchChatPreview: (chatId: string, lastMessage: string) => void,
 * }}
 */
export function useCanvasChats(articleId) {
  const [activeChatId, setActiveChatId] = useState(null);
  const ensuredInitialRef = useRef(false);

  const {
    chats,
    setChats,
    isLoading,
    hasLoadedChats,
    setHasLoadedChats,
    error,
    setError,
    refreshChats,
    deleteChat: deleteChatBase,
  } = useChatsApi(articleId);

  // Wrap deleteChat to also clear activeChatId when the deleted chat is active
  const deleteChat = useCallback(
    async (chatId) => {
      const ok = await deleteChatBase(chatId);
      if (ok) {
        setActiveChatId((current) => (current === chatId ? null : current));
      }
      return ok;
    },
    [deleteChatBase],
  );

  const selectChat = useSelectChat(articleId, setActiveChatId, setError);

  const touchChatPreview = useCallback(
    (chatId, lastMessage) => {
      if (!chatId) return;
      setChats((prev) => buildTouchedChatsList(prev, chatId, lastMessage, articleId));
    },
    [articleId, setChats],
  );

  // Initial load: fetch chats when article changes
  useEffect(() => {
    if (!articleId) return;
    ensuredInitialRef.current = false;
    setHasLoadedChats(false);
    refreshChats();
  }, [articleId, refreshChats, setHasLoadedChats]);

  // Set active chat to the most recent one if available
  useEffect(() => {
    if (!articleId) return;
    if (!hasLoadedChats) return;
    if (isLoading) return;
    if (activeChatId) return;
    if (ensuredInitialRef.current) return;
    ensuredInitialRef.current = true;
    if (chats.length > 0) {
      setActiveChatId(chats[0].chat_id);
    }
    // No longer auto-create empty chat; let user send first message to create one
  }, [articleId, hasLoadedChats, isLoading, activeChatId, chats]);

  return {
    chats,
    activeChatId,
    isLoading,
    error,
    refreshChats,
    selectChat,
    deleteChat,
    setActiveChatId,
    touchChatPreview,
  };
}
