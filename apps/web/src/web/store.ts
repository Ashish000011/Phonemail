import { create } from 'zustand';
import type { ComposeTarget } from '../mobile/compose/Composer';

interface ComposeWindow {
  target: ComposeTarget;
  /** Changes on every open, so a new email always starts from a fresh form. */
  key: number;
  minimized: boolean;
  maximized: boolean;
}

interface WebState {
  compose: ComposeWindow | null;
  openCompose: (target?: Partial<ComposeTarget>) => void;
  closeCompose: () => void;
  toggleMinimized: () => void;
  toggleMaximized: () => void;
  /** Rows that just arrived live, highlighted for a moment */
  fresh: Set<string>;
  markFresh: (messageId: string) => void;
}

const EMPTY_TARGET: ComposeTarget = {
  draftId: null,
  conversationId: null,
  replyToId: null,
  threadId: null,
};

let composeCounter = 0;

/** State the web client's screens share: the floating compose window and live highlights. */
export const useWeb = create<WebState>((set) => ({
  compose: null,
  openCompose: (target = {}) => {
    composeCounter += 1;
    set({
      compose: {
        target: { ...EMPTY_TARGET, ...target },
        key: composeCounter,
        minimized: false,
        maximized: false,
      },
    });
  },
  closeCompose: () => set({ compose: null }),
  toggleMinimized: () =>
    set((s) => (s.compose ? { compose: { ...s.compose, minimized: !s.compose.minimized } } : s)),
  toggleMaximized: () =>
    set((s) =>
      s.compose
        ? { compose: { ...s.compose, maximized: !s.compose.maximized, minimized: false } }
        : s,
    ),
  fresh: new Set(),
  markFresh: (messageId) => {
    set((s) => ({ fresh: new Set(s.fresh).add(messageId) }));
    setTimeout(
      () =>
        set((s) => {
          const next = new Set(s.fresh);
          next.delete(messageId);
          return { fresh: next };
        }),
      2500,
    );
  },
}));
