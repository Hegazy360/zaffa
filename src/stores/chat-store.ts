import { create } from "zustand";

/**
 * Shared state for the AI chat widget.
 *
 * A module-level store (like the venue-designer's) because the widget has
 * two entry points that live in different trees: the floating launcher
 * mounted from the root layout, and the homepage AskZaffa section's
 * suggested-question chips. Both call `open()`; the panel is the single
 * view. Messages live here rather than in the panel so closing and
 * reopening keeps the thread - in-memory only, so a full reload starts a
 * fresh conversation (matching the server, where Turnstile is
 * per-conversation).
 */

export interface ChatBubble {
  role: "user" | "assistant";
  content: string;
  status: "ok" | "pending" | "error";
}

interface ChatState {
  isOpen: boolean;
  /** Server-minted on the first successful ask. */
  conversationId: string | null;
  messages: ChatBubble[];
  /** A question queued by an entry point (homepage chip) for the panel to
   *  auto-send on mount. Consumed exactly once. */
  seedQuestion: string | null;
  open(seedQuestion?: string): void;
  close(): void;
  consumeSeed(): string | null;
  setConversationId(id: string): void;
  append(bubble: ChatBubble): void;
  /** Replace the trailing pending/error assistant bubble (the typing
   *  placeholder) with a settled one. */
  settleLast(bubble: ChatBubble): void;
  removeLast(): void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  isOpen: false,
  conversationId: null,
  messages: [],
  seedQuestion: null,
  open: (seedQuestion) =>
    set({ isOpen: true, ...(seedQuestion ? { seedQuestion } : {}) }),
  close: () => set({ isOpen: false }),
  consumeSeed: () => {
    const seed = get().seedQuestion;
    if (seed) set({ seedQuestion: null });
    return seed;
  },
  setConversationId: (id) => set({ conversationId: id }),
  append: (bubble) => set({ messages: [...get().messages, bubble] }),
  settleLast: (bubble) => {
    const messages = [...get().messages];
    messages[messages.length - 1] = bubble;
    set({ messages });
  },
  removeLast: () => set({ messages: get().messages.slice(0, -1) }),
}));
