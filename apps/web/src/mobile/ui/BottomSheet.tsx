import { useCallback, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useFocusTrap } from './useFocusTrap';

/**
 * A sheet that slides up from the bottom, like WhatsApp's permission and
 * action sheets. Tap outside or press Escape to close.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** Use an existing heading inside the sheet as its name. */
  labelledBy?: string;
}) {
  const reduceMotion = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = useCallback(() => onClose(), [onClose]);
  useFocusTrap(panel, open, close);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
            onClick={close}
            aria-hidden="true"
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy ?? (title ? titleId : undefined)}
            tabIndex={-1}
            className="relative max-h-[85dvh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl bg-surface px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl outline-none"
            initial={reduceMotion ? { opacity: 0 } : { y: '100%' }}
            animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { y: '100%' }}
            transition={{ type: 'tween', duration: reduceMotion ? 0 : 0.22, ease: 'easeOut' }}
          >
            <div aria-hidden="true" className="mx-auto mb-4 h-1 w-9 rounded-full bg-black/15" />
            {title && (
              <h2 id={titleId} className="mb-2 text-[1.125rem] font-medium">
                {title}
              </h2>
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** The WhatsApp-style pair of sheet buttons: a quiet one and a filled one. */
export function SheetActions({
  secondary,
  onSecondary,
  primary,
  onPrimary,
}: {
  secondary?: string;
  onSecondary?: () => void;
  primary: string;
  onPrimary: () => void;
}) {
  return (
    <div className="mt-5 flex gap-3">
      {secondary && (
        <button
          type="button"
          onClick={onSecondary}
          className="min-h-11 flex-1 rounded-full border border-black/15 font-medium text-brand"
        >
          {secondary}
        </button>
      )}
      <button
        type="button"
        onClick={onPrimary}
        data-autofocus
        className="min-h-11 flex-1 rounded-full bg-brand font-medium text-white"
      >
        {primary}
      </button>
    </div>
  );
}
