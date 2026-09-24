import { useEffect } from 'react';
import { create } from 'zustand';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

/** Short messages at the bottom ("Copied", "You've already replied to this email"). */
interface ToastState {
  message: string | null;
  id: number;
  show: (message: string) => void;
  clear: () => void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  id: 0,
  show: (message) => set((s) => ({ message, id: s.id + 1 })),
  clear: () => set({ message: null }),
}));

export function toast(message: string) {
  useToast.getState().show(message);
}

export function ToastHost() {
  const { message, id, clear } = useToast();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(clear, 2600);
    return () => clearTimeout(timer);
  }, [message, id, clear]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-6"
    >
      <AnimatePresence>
        {message && (
          <motion.div
            key={id}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
            className="max-w-sm rounded-full bg-[#1f2c33] px-5 py-3 text-center text-[0.875rem] text-white shadow-lg"
          >
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
