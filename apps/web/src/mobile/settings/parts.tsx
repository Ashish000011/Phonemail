import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { meSchema, type Me, type UpdateMeBody } from '@phonemail/shared';
import { api } from '../../shared/api';
import { useErrorText } from '../../shared/errors';
import { useDocumentTitle } from '../../shared/useDocumentTitle';
import { IconButton } from '../ui/IconButton';
import { TopBar } from '../ui/TopBar';
import { toast } from '../ui/toast';
import { useGoBack } from '../ui/useGoBack';

/** One settings screen: a back arrow, a title, and grouped white sections on grey. */
export function SettingsPage({
  title,
  children,
  back = '/m/settings',
}: {
  title: string;
  children: ReactNode;
  back?: string;
}) {
  const { t } = useTranslation();
  const goBack = useGoBack(back);
  useDocumentTitle(title);
  return (
    <div className="flex min-h-dvh flex-col bg-[#f0f2f5]">
      <TopBar
        title={title}
        left={<IconButton label={t('common.back')} icon={ArrowLeft} onClick={goBack} />}
      />
      <main className="flex flex-1 flex-col gap-2 pb-8">{children}</main>
    </div>
  );
}

export function Section({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bg-surface">
      {title && <h2 className="px-6 pt-4 pb-1 text-[0.875rem] font-medium text-brand">{title}</h2>}
      {children}
      {footer && <p className="px-6 pb-4 text-[0.8125rem] text-text-muted">{footer}</p>}
    </section>
  );
}

/** A tappable row: icon, title, a grey second line, and a chevron when it opens a screen. */
export function Row({
  icon: Icon,
  title,
  subtitle,
  onClick,
  trailing,
  danger = false,
  chevron = false,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: ReactNode;
  onClick?: () => void;
  trailing?: ReactNode;
  danger?: boolean;
  chevron?: boolean;
}) {
  const content = (
    <>
      {Icon && (
        <Icon
          size={22}
          aria-hidden="true"
          className={`shrink-0 ${danger ? 'text-danger' : 'text-text-muted'}`}
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`text-[1rem] ${danger ? 'text-danger' : ''}`}>{title}</span>
        {subtitle && (
          <span className="text-[0.8125rem] break-words text-text-muted">{subtitle}</span>
        )}
      </span>
      {trailing}
      {chevron && (
        <ChevronRight size={20} aria-hidden="true" className="shrink-0 text-text-muted" />
      )}
    </>
  );
  const className = 'flex min-h-16 w-full items-center gap-5 px-6 py-3 text-left';
  return onClick ? (
    <button type="button" onClick={onClick} className={`${className} hover:bg-black/[0.03]`}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

/** An on/off setting. A real switch for screen readers ("Read receipts, switch, on"). */
export function ToggleRow({
  title,
  subtitle,
  checked,
  onChange,
}: {
  title: string;
  subtitle?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-16 w-full items-center gap-5 px-6 py-3 text-left hover:bg-black/[0.03]"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[1rem]">{title}</span>
        {subtitle && <span className="text-[0.8125rem] text-text-muted">{subtitle}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-brand/50' : 'bg-black/25'}`}
      >
        <span
          className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full shadow transition-all ${
            checked ? 'left-4 bg-brand' : 'left-0 bg-white'
          }`}
        />
      </span>
    </button>
  );
}

/** Saves profile and settings changes; the screen updates at once and rolls back on error. */
export function useUpdateMe() {
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  return async (body: UpdateMeBody): Promise<Me | null> => {
    const previous = queryClient.getQueryData<Me>(['me']);
    if (previous) queryClient.setQueryData<Me>(['me'], { ...previous, ...body });
    try {
      const me = await api('/me', { method: 'PATCH', body, schema: meSchema });
      queryClient.setQueryData(['me'], me);
      return me;
    } catch (err) {
      if (previous) queryClient.setQueryData(['me'], previous);
      toast(errorText(err));
      return null;
    }
  };
}
