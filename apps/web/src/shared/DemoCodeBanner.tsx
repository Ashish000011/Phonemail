import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Demo mode only: the server returns the code it "sent" to the demo console,
 * so judges can sign up without a real phone. Never shown in production.
 */
export function DemoCodeBanner({ code }: { code: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (http, old browser): the code is visible anyway.
    }
  }

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 rounded-lg bg-[#fff4d6] px-3 py-2 text-sm text-text"
    >
      <span>{t('common.demoCode', { code })}</span>
      <button
        type="button"
        onClick={copy}
        className="min-h-9 rounded-md px-2 font-medium text-brand hover:bg-black/5"
      >
        {copied ? t('common.copied') : t('common.copy')}
      </button>
    </div>
  );
}
