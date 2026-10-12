// Store to persist chat history and UI state across component remounts (e.g., fullscreen toggle)
// Uses immutable updates and proper React 18 external store pattern
// Everything is in-memory only — no localStorage persistence

import { useSyncExternalStore, useCallback, useRef, useEffect } from "react";
import type { ChartSuggestion } from "./ai-service";

type ChatMessage = {
  prompt: string;
  response: string;
  chart?: ChartSuggestion;
  /** Stopped by the user: `response` holds what was streamed so far. */
  cancelled?: boolean;
};

type AnalysisTab = "summary" | "anomalies" | "custom";

type ChatStore = {
  history: ChatMessage[];
  streamingResponse: string;
  currentPrompt: string;
  activeTab: AnalysisTab;
  isLoading: boolean; // Track if custom query is loading
  pendingPrompt: string; // The prompt being processed
  version: number; // Force re-render on updates
};

// Initial state
const initialState: ChatStore = {
  history: [],
  streamingResponse: "",
  currentPrompt: "",
  activeTab: "summary",
  isLoading: false,
  pendingPrompt: "",
  version: 0,
};

// Global state that persists across component mounts/unmounts (in-memory only)
let store: ChatStore = { ...initialState };

// Subscribers to notify on state changes
const subscribers = new Set<() => void>();

function notifySubscribers() {
  // Use microtask to batch updates and avoid race conditions
  queueMicrotask(() => {
    subscribers.forEach((callback) => {
      try {
        callback();
      } catch (e) {
        console.error("Chat store subscriber error:", e);
      }
    });
  });
}

// Immediate notification for critical updates (like streaming)
function notifySubscribersSync() {
  subscribers.forEach((callback) => {
    try {
      callback();
    } catch (e) {
      console.error("Chat store subscriber error:", e);
    }
  });
}

export function getChatStore(): ChatStore {
  return store;
}

function updateStore(
  updates: Partial<Omit<ChatStore, "version">>,
  sync = false,
) {
  store = {
    ...store,
    ...updates,
    version: store.version + 1,
  };
  if (sync) {
    notifySubscribersSync();
  } else {
    notifySubscribers();
  }
}

export function addChatMessage(message: ChatMessage) {
  updateStore({
    history: [...store.history, message],
    streamingResponse: "",
    isLoading: false,
    pendingPrompt: "",
  });
}

export function setStreamingResponse(response: string) {
  updateStore({ streamingResponse: response }, true);
}

export function appendStreamingResponse(chunk: string) {
  updateStore({ streamingResponse: store.streamingResponse + chunk }, true);
}

export function setCurrentPrompt(prompt: string) {
  updateStore({ currentPrompt: prompt });
}

export function setLoadingState(isLoading: boolean, pendingPrompt = "") {
  updateStore(
    { isLoading, pendingPrompt: isLoading ? pendingPrompt : "" },
    true,
  );
}

export function updateChatMessageByIndex(
  index: number,
  updates: Partial<Pick<ChatMessage, "chart">>,
) {
  if (index < 0 || index >= store.history.length) return;
  const updated = [...store.history];
  updated[index] = { ...updated[index]!, ...updates };
  updateStore({ history: updated });
}

export function clearChatStore() {
  store = { ...initialState, version: store.version + 1 };
  notifySubscribers();
}

export function setActiveTabInStore(tab: AnalysisTab) {
  if (store.activeTab !== tab) {
    updateStore({ activeTab: tab }, true);
  }
}

export function subscribeToChatStore(callback: () => void): () => void {
  subscribers.add(callback);
  // Immediately call to sync initial state
  callback();
  return () => {
    subscribers.delete(callback);
  };
}

/** True while a chat answer is streaming. Re-renders only when that flag changes. */
export function useChatIsLoading(): boolean {
  return useSyncExternalStore(
    subscribeToChatStore,
    () => store.isLoading,
    () => false,
  );
}

/** Chat turns to send back to the model: failed and cancelled answers are flagged. */
export function toModelHistory(history: ChatMessage[]) {
  return history.map((item) => ({
    prompt: item.prompt,
    response: item.response,
    error: !!item.cancelled || item.response.startsWith("[ERROR]"),
  }));
}

// React hook to use the chat store
export function useChatStore() {
  // Keep a ref to the latest store for stable callbacks
  const storeRef = useRef(store);

  const storeState = useSyncExternalStore(
    subscribeToChatStore,
    getChatStore,
    () => initialState, // Server snapshot - use initial state
  );

  // Keep ref updated
  useEffect(() => {
    storeRef.current = storeState;
  }, [storeState]);

  const addMessage = useCallback((message: ChatMessage) => {
    addChatMessage(message);
  }, []);

  const setStreaming = useCallback((response: string) => {
    setStreamingResponse(response);
  }, []);

  const appendStreaming = useCallback((chunk: string) => {
    appendStreamingResponse(chunk);
  }, []);

  const setPrompt = useCallback((prompt: string) => {
    setCurrentPrompt(prompt);
  }, []);

  const updateMessageAt = useCallback(
    (index: number, updates: Partial<Pick<ChatMessage, "chart">>) => {
      updateChatMessageByIndex(index, updates);
    },
    [],
  );

  const clearChat = useCallback(() => {
    clearChatStore();
  }, []);

  const setActiveTab = useCallback((tab: AnalysisTab) => {
    setActiveTabInStore(tab);
  }, []);

  const setLoading = useCallback((isLoading: boolean, pendingPrompt = "") => {
    setLoadingState(isLoading, pendingPrompt);
  }, []);

  return {
    history: storeState.history,
    streamingResponse: storeState.streamingResponse,
    currentPrompt: storeState.currentPrompt,
    activeTab: storeState.activeTab,
    isLoading: storeState.isLoading,
    pendingPrompt: storeState.pendingPrompt,
    addMessage,
    updateMessageAt,
    setStreaming,
    appendStreaming,
    setPrompt,
    clearChat,
    setActiveTab,
    setLoading,
  };
}

export type { AnalysisTab, ChatMessage };
