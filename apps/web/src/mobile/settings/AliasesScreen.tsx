import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, Trash2, X } from 'lucide-react';
import { z } from 'zod';
import { aliasCheckResponseSchema, aliasSchema, type Alias, type Me } from '@phonemail/shared';
import { api } from '../../shared/api';
import { useErrorText } from '../../shared/errors';
import { useConfig } from '../../shared/useConfig';
import { RequireUser } from '../MobileShell';
import { Dialog } from '../ui/Dialog';
import { IconButton } from '../ui/IconButton';
import { SkeletonRows } from '../ui/bits';
import { toast } from '../ui/toast';
import { Section, SettingsPage, useUpdateMe } from './parts';

/** Days a deleted alias stays reserved (docs/spec/03, "Aliases"). */
const HOLD_DAYS = 30;

export function AliasesScreen() {
  return <RequireUser>{(me) => <Aliases me={me} />}</RequireUser>;
}

/** Waits until typing pauses, so the availability check doesn't run on every key. */
function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * Settings → Aliases: extra addresses like arjun@phonemail.com. Mail to them
 * lands in the same chats. You pick which address your emails come from, add
 * one with a live check that says why a name can't be used, and delete one
 * (it stays reserved for 30 days so nobody else gets your mail).
 */
function Aliases({ me }: { me: Me }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  const updateMe = useUpdateMe();
  const config = useConfig();
  const domain = config.data?.mailDomain ?? me.address.split('@')[1];
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Alias | null>(null);
  const localPart = useDebounced(name.trim().toLowerCase(), 350);

  const aliases = useQuery({
    queryKey: ['aliases'],
    queryFn: () => api('/aliases', { schema: z.array(aliasSchema) }),
  });
  const check = useQuery({
    queryKey: ['alias-check', localPart],
    queryFn: () =>
      api(`/aliases/check?localPart=${encodeURIComponent(localPart)}`, {
        schema: aliasCheckResponseSchema,
      }),
    enabled: localPart.length > 0,
    staleTime: 10_000,
  });
  const typed = name.trim().toLowerCase();
  const checked = typed === localPart && check.data;
  const available = Boolean(checked && check.data?.available);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!available || adding) return;
    setAdding(true);
    try {
      const alias = await api('/aliases', {
        method: 'POST',
        body: { localPart: typed },
        schema: aliasSchema,
      });
      queryClient.setQueryData<Alias[]>(['aliases'], (list) => [...(list ?? []), alias]);
      setName('');
      toast(t('aliases.added', { address: alias.address }));
    } catch (err) {
      toast(errorText(err));
    } finally {
      setAdding(false);
      void queryClient.invalidateQueries({ queryKey: ['alias-check'] });
    }
  }

  async function remove(alias: Alias) {
    setDeleting(null);
    try {
      await api(`/aliases/${alias.id}`, { method: 'DELETE' });
      queryClient.setQueryData<Alias[]>(['aliases'], (list) =>
        list?.filter((a) => a.id !== alias.id),
      );
      if (me.defaultSendAsAliasId === alias.id)
        void queryClient.invalidateQueries({ queryKey: ['me'] });
      toast(t('aliases.deleted'));
    } catch (err) {
      toast(errorText(err));
    }
  }

  const options = [
    { id: null as string | null, address: me.address, note: t('aliases.primary') },
    ...(aliases.data ?? []).map((a) => ({
      id: a.id as string | null,
      address: a.address,
      note: null,
    })),
  ];

  return (
    <SettingsPage title={t('settings.aliases')}>
      <Section footer={t('aliases.explain')}>
        <h2 id="send-as" className="px-6 pt-4 pb-1 text-[0.875rem] font-medium text-brand">
          {t('aliases.sendAs')}
        </h2>
        {aliases.isPending ? (
          <SkeletonRows count={2} />
        ) : (
          <ul role="radiogroup" aria-labelledby="send-as">
            {options.map((option) => {
              const selected = (me.defaultSendAsAliasId ?? null) === option.id;
              const alias = aliases.data?.find((a) => a.id === option.id);
              return (
                <li key={option.id ?? 'primary'} className="flex items-center pr-3">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => void updateMe({ defaultSendAsAliasId: option.id })}
                    className="flex min-h-14 min-w-0 flex-1 items-center gap-5 px-6 text-left hover:bg-black/[0.03]"
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        selected ? 'border-brand' : 'border-text-muted'
                      }`}
                    >
                      {selected && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[1rem]">{option.address}</span>
                      {option.note && (
                        <span className="text-[0.8125rem] text-text-muted">{option.note}</span>
                      )}
                    </span>
                  </button>
                  {alias && (
                    <IconButton
                      label={t('aliases.delete', { address: alias.address })}
                      icon={Trash2}
                      onClick={() => setDeleting(alias)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={t('aliases.addTitle')}>
        <form onSubmit={add} className="px-6 pb-4">
          <label htmlFor="alias-name" className="sr-only">
            {t('aliases.nameLabel')}
          </label>
          <div className="flex items-center gap-2 border-b-2 border-brand">
            <input
              id="alias-name"
              value={name}
              onChange={(e) => setName(e.target.value.replace(/\s/g, ''))}
              maxLength={64}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t('aliases.placeholder')}
              aria-describedby="alias-status"
              className="min-w-0 flex-1 py-2 text-[1rem] outline-none"
            />
            <span className="shrink-0 text-text-muted">@{domain}</span>
          </div>
          <p
            id="alias-status"
            role="status"
            className="mt-2 flex min-h-5 items-center gap-1.5 text-[0.8125rem]"
          >
            {typed && !checked && (
              <>
                <Loader2 size={14} aria-hidden="true" className="animate-spin text-text-muted" />
                <span className="text-text-muted">{t('aliases.checking')}</span>
              </>
            )}
            {checked && available && (
              <>
                <Check size={16} aria-hidden="true" className="text-brand" />
                <span className="text-brand">
                  {t('aliases.available', { address: `${typed}@${domain}` })}
                </span>
              </>
            )}
            {checked && !available && (
              <>
                <X size={16} aria-hidden="true" className="text-danger" />
                <span className="text-danger">
                  {t(`errors.${check.data?.reason ?? 'ALIAS_INVALID'}`)}
                </span>
              </>
            )}
          </p>
          <button
            type="submit"
            disabled={!available || adding}
            className="mt-3 min-h-11 rounded-full bg-brand px-6 text-[0.9375rem] font-medium text-white hover:bg-[#006e5a] disabled:opacity-50"
          >
            {adding ? t('aliases.adding') : t('aliases.add')}
          </button>
          <p className="mt-3 text-[0.75rem] text-text-muted">{t('aliases.rules')}</p>
        </form>
      </Section>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('aliases.deleteTitle', { address: deleting?.address ?? '' })}
        actions={[
          { label: t('common.cancel'), onClick: () => setDeleting(null) },
          {
            label: t('aliases.deleteConfirm'),
            onClick: () => deleting && void remove(deleting),
            danger: true,
          },
        ]}
      >
        <p>{t('aliases.deleteBody', { days: HOLD_DAYS })}</p>
      </Dialog>
    </SettingsPage>
  );
}
