import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import { MIN_PASSWORD_LENGTH, meSchema, type Me } from '@phonemail/shared';
import { api } from '../../shared/api';
import { useErrorText } from '../../shared/errors';
import { useSignOut } from '../../shared/session';
import { useDocumentTitle } from '../../shared/useDocumentTitle';
import { TopBar } from '../ui/TopBar';
import { PrimaryButton } from '../ui/bits';
import { toast } from '../ui/toast';
import { useGoBack } from '../ui/useGoBack';
import { SettingsPage } from './parts';

/**
 * Set or change the password (password sign-in mode). With `forced`, this is
 * the only screen a user signed in with a temporary PIN from the phone call
 * can see until they choose their own password; the server refuses
 * everything else meanwhile (PASSWORD_CHANGE_REQUIRED).
 */
export function PasswordForm({ me, forced = false }: { me: Me; forced?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const goBack = useGoBack('/m/settings');
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  const signOut = useSignOut();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const needsCurrent = me.hasPassword && !me.mustChangePassword;
  const title = forced
    ? t('password.forcedTitle')
    : me.hasPassword
      ? t('settings.passwordChange')
      : t('settings.passwordSet');
  useDocumentTitle(title);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (next.length < MIN_PASSWORD_LENGTH) return setError(t('errors.PASSWORD_TOO_SHORT'));
    if (next !== repeat) return setError(t('password.mismatch'));
    setError(null);
    setSaving(true);
    try {
      await api('/auth/password/change', {
        method: 'POST',
        body: { currentPassword: needsCurrent ? current : undefined, newPassword: next },
      });
      queryClient.setQueryData(['me'], await api('/me', { schema: meSchema }));
      toast(t('password.saved'));
      if (!forced) goBack();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    'w-full border-b-2 border-black/15 py-2 pr-10 text-[1rem] outline-none focus:border-brand';
  const form = (
    <form onSubmit={submit} className="flex flex-col gap-5 bg-surface px-6 py-6" noValidate>
      {forced && <p className="text-[0.9375rem] text-text-muted">{t('password.forcedBody')}</p>}
      {needsCurrent && (
        <div>
          <label htmlFor="password-current" className="text-[0.8125rem] text-text-muted">
            {t('password.current')}
          </label>
          <input
            id="password-current"
            type={visible ? 'text' : 'password'}
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={inputClass}
          />
        </div>
      )}
      <div className="relative">
        <label htmlFor="password-new" className="text-[0.8125rem] text-text-muted">
          {t('password.new')}
        </label>
        <input
          id="password-new"
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          aria-describedby="password-rules"
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t('password.hide') : t('password.show')}
          aria-pressed={visible}
          className="absolute right-0 bottom-1 flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-black/5"
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
        <p id="password-rules" className="mt-1 text-[0.75rem] text-text-muted">
          {t('password.rules', { min: MIN_PASSWORD_LENGTH })}
        </p>
      </div>
      <div>
        <label htmlFor="password-repeat" className="text-[0.8125rem] text-text-muted">
          {t('password.repeat')}
        </label>
        <input
          id="password-repeat"
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          className={inputClass}
        />
      </div>
      <p role="alert" className="min-h-5 text-[0.875rem] text-danger">
        {error}
      </p>
      <PrimaryButton type="submit" disabled={saving}>
        {saving ? t('onboarding.pleaseWait') : t('password.save')}
      </PrimaryButton>
      {forced && (
        <button
          type="button"
          onClick={() => void signOut().then(() => navigate('/m/welcome', { replace: true }))}
          className="self-center rounded-full px-4 py-2 text-[0.875rem] text-text-muted hover:bg-black/5"
        >
          {t('settings.logOut')}
        </button>
      )}
    </form>
  );

  if (!forced) return <SettingsPage title={title}>{form}</SettingsPage>;
  return (
    <div className="flex min-h-dvh flex-col bg-[#f0f2f5]">
      <TopBar title={title} />
      <main className="flex-1">{form}</main>
    </div>
  );
}
