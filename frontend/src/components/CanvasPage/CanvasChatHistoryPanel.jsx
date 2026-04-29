import React from "react";

/**
 * @typedef {import("./useCanvasChats").CanvasChatSummary} CanvasChatSummary
 */

/**
 * @param {{
 *   chats: CanvasChatSummary[],
 *   activeChatId: string|null,
 *   isLoading: boolean,
 *   error: string|null,
 *   onSelectChat: (chatId: string) => void,
 *   onDeleteChat: (chatId: string) => void,
 *   onNewChat: () => void,
 *   onClose: () => void,
 * }} props
 */
export default function CanvasChatHistoryPanel({
  chats,
  activeChatId,
  isLoading,
  error,
  onSelectChat,
  onDeleteChat,
  onNewChat,
  onClose,
}) {
  /**
   * @param {string} iso
   * @returns {string}
   */
  const formatDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
  };

  return (
    <div className="canvas-chat-history-panel">
      <div className="canvas-chat-history-header">
        <span className="canvas-chat-history-title">Chat history</span>
        <div className="canvas-chat-history-actions">
          <button
            type="button"
            className="canvas-chat-history-new"
            onClick={onNewChat}
            title="Start a new chat"
          >
            + New
          </button>
          <button
            type="button"
            className="canvas-chat-history-close"
            onClick={onClose}
            title="Close history"
            aria-label="Close history"
          >
            ✕
          </button>
        </div>
      </div>
      {error && (
        <div className="canvas-chat-history-error" role="alert">
          {error}
        </div>
      )}
      <div className="canvas-chat-history-list" role="list">
        {isLoading && chats.length === 0 && (
          <div className="canvas-chat-history-empty">Loading…</div>
        )}
        {!isLoading && chats.length === 0 && (
          <div className="canvas-chat-history-empty">No chats yet</div>
        )}
        {chats.map((chat) => {
          const isActive = chat.chat_id === activeChatId;
          const classes = ["canvas-chat-history-item"];
          if (isActive) classes.push("is-active");
          return (
            <div
              key={chat.chat_id}
              className={classes.join(" ")}
              role="listitem"
            >
              <button
                type="button"
                className="canvas-chat-history-item-select"
                onClick={() => onSelectChat(chat.chat_id)}
                title={chat.title}
              >
                <span className="canvas-chat-history-item-title">
                  {chat.title || "New chat"}
                </span>
                <span className="canvas-chat-history-item-meta">
                  {formatDate(chat.updated_at)} · {chat.message_count} msg ·{" "}
                  {chat.event_count} ev
                </span>
              </button>
              <button
                type="button"
                className="canvas-chat-history-item-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm("Delete this chat?")) {
                    onDeleteChat(chat.chat_id);
                  }
                }}
                title="Delete chat"
                aria-label="Delete chat"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
