import { AlertCircle, Check, CheckCheck, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DeliveryState } from '@phonemail/shared';

/**
 * WhatsApp's ticks: clock (sending), one grey tick (sent), two grey ticks
 * (delivered), two blue ticks (read). Color never carries the meaning alone:
 * each has a screen-reader label.
 */
export function Ticks({ state, size = 16 }: { state: DeliveryState | null; size?: number }) {
  const { t } = useTranslation();
  if (!state) return null;
  const label = t(`ticks.${state}`);
  const common = { size, strokeWidth: 2.2, 'aria-hidden': true } as const;
  return (
    <span role="img" aria-label={label} title={label} className="inline-flex shrink-0">
      {state === 'sending' && <Clock {...common} className="text-text-muted" />}
      {state === 'sent' && <Check {...common} className="text-text-muted" />}
      {state === 'delivered' && <CheckCheck {...common} className="text-text-muted" />}
      {state === 'read' && <CheckCheck {...common} className="text-tick-read" />}
      {state === 'failed' && <AlertCircle {...common} className="text-danger" />}
    </span>
  );
}
