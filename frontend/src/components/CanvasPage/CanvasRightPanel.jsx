import React, { useState } from "react";
import CanvasChatPanel from "./CanvasChatPanel";
import CanvasEventsPanel from "./CanvasEventsPanel";

/**
 * @typedef {import("./useCanvasChats").CanvasChatSummary} CanvasChatSummary
 */

/**
 * Right-side tabbed panel with Chat and Events tabs.
 * @param {{
 *   show: boolean,
 *   newIndices: Set<number>,
 *   articleId: string,
 *   chatId: string|null,
 *   chats: CanvasChatSummary[],
 *   isChatsLoading: boolean,
 *   chatsError: string|null,
 *   onSelectChat: (chatId: string) => void,
 *   onDeleteChat: (chatId: string) => void,
 *   onNewChat: () => void,
 *   onChatPersisted: (chatId: string, lastMessage: string) => void,
 *   messages: Array<unknown>,
 *   setMessages: React.Dispatch<React.SetStateAction<Array<unknown>>>,
 *   isChatLoading: boolean,
 *   setIsChatLoading: React.Dispatch<React.SetStateAction<boolean>>,
 *   contextPages: string,
 *   setContextPages: React.Dispatch<React.SetStateAction<string>>,
 *   articlePages: Array<unknown>,
 *   fetchEvents: () => void,
 *   events: Array<unknown>,
 *   selectedIndex: number | null,
 *   isLive: boolean,
 *   deleteError: string | null,
 *   onSelectEvent: (index: number) => void,
 *   onGoLive: () => void,
 *   onDeleteEvent: (index: number) => void,
 *   showEvents: boolean,
 *   onToggleEvents: () => void,
 * }} props
 */
export default function CanvasRightPanel({
  show,
  newIndices,
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
  events,
  selectedIndex,
  isLive,
  deleteError,
  onSelectEvent,
  onGoLive,
  onDeleteEvent,
  showEvents,
  onToggleEvents,
}) {
  const [activeTab, setActiveTab] = useState("chat");

  if (!show) return null;

  return (
    <div className="canvas-chat-panel">
      <div className="canvas-panel-tabs">
        <button
          type="button"
          className={`canvas-panel-tab${activeTab === "chat" ? " is-active" : ""}`}
          onClick={() => setActiveTab("chat")}
        >
          Chat
        </button>
        <button
          type="button"
          className={`canvas-panel-tab${activeTab === "events" ? " is-active" : ""}`}
          onClick={() => setActiveTab("events")}
        >
          Events
          {newIndices.size > 0 && <span className="canvas-tab-dot" />}
        </button>
      </div>

      {activeTab === "chat" && (
        <CanvasChatPanel
          articleId={articleId}
          chatId={chatId}
          chats={chats}
          isChatsLoading={isChatsLoading}
          chatsError={chatsError}
          onSelectChat={onSelectChat}
          onDeleteChat={onDeleteChat}
          onNewChat={onNewChat}
          onChatPersisted={onChatPersisted}
          messages={messages}
          setMessages={setMessages}
          isChatLoading={isChatLoading}
          setIsChatLoading={setIsChatLoading}
          contextPages={contextPages}
          setContextPages={setContextPages}
          articlePages={articlePages}
          fetchEvents={fetchEvents}
        />
      )}

      {activeTab === "events" && (
        <CanvasEventsPanel
          events={events}
          selectedIndex={selectedIndex}
          isLive={isLive}
          newIndices={newIndices}
          deleteError={deleteError}
          onSelectEvent={onSelectEvent}
          onGoLive={onGoLive}
          onDeleteEvent={onDeleteEvent}
          showEvents={showEvents}
          onToggleEvents={onToggleEvents}
        />
      )}
    </div>
  );
}
