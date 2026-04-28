import React, { useState } from "react";
import CanvasChatPanel from "./CanvasChatPanel";
import CanvasEventsPanel from "./CanvasEventsPanel";

/**
 * Right-side tabbed panel with Chat and Events tabs.
 * @param {{
 *   show: boolean,
 *   newIndices: Set<number>,
 *   articleId: string,
 *   messages: Array<unknown>,
 *   setMessages: React.Dispatch<React.SetStateAction<Array<unknown>>>,
 *   isChatLoading: boolean,
 *   setIsChatLoading: React.Dispatch<React.SetStateAction<boolean>>,
 *   contextPages: unknown,
 *   setContextPages: React.Dispatch<React.SetStateAction<unknown>>,
 *   articlePages: Array<unknown>,
 *   fetchEvents: () => void,
 *   events: Array<unknown>,
 *   selectedIndex: number | null,
 *   isLive: boolean,
 *   deleteError: string | null,
 *   onSelectEvent: (index: number) => void,
 *   onGoLive: () => void,
 *   onDeleteEvent: (index: number) => void,
 * }} props
 */
export default function CanvasRightPanel({
  show,
  newIndices,
  articleId,
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
        />
      )}
    </div>
  );
}
