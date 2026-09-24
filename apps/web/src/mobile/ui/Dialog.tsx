import { useCallback, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useFocusTrap } from './useFocusTrap';

export interface DialogAction {
  label: string;
  onClick: () => void;
  /** Red text for destructive actions ("Delete forever"). */
  danger?: boolean;
  autoFocus?: boolean;
}

/**
 * A centered confirmation dialog with text buttons on the right, like
 * WhatsApp's "You entered the phone number … [Edit] [OK]".
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  actions: DialogAction[];
}) {
  const reduceMotion = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const close = useCallback(() => onClose(), [onClose]);
  useFocusTrap(panel, open, close);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.15 }}
            onClick={close}
            aria-hidden="true"
          />
          <motion.div
            ref={panel}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={bodyId}
            tabIndex={-1}
            className="relative w-full max-w-sm rounded-3xl bg-surface p-6 shadow-xl outline-none"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            transition={{ duration: reduceMotion ? 0 : 0.15 }}
          >
            {title && (
              <h2 id={titleId} className="mb-3 text-[1.125rem] font-medium">
                {title}
              </h2>
            )}
            <div id={bodyId} className="text-[0.9375rem] text-text-muted">
              {children}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  data-autofocus={action.autoFocus ? '' : undefined}
                  className={`min-h-11 rounded-full px-4 font-medium hover:bg-black/5 ${
                    action.danger ? 'text-danger' : 'text-brand'
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
