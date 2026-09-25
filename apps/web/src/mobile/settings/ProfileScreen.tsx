import { useRef, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AtSign, Camera, Copy, Info, Loader2, Phone, Trash2, User } from 'lucide-react';
import { meSchema, type Me } from '@phonemail/shared';
import { api } from '../../shared/api';
import { useErrorText } from '../../shared/errors';
import { RequireUser } from '../MobileShell';
import { Avatar, avatarFromMe } from '../ui/Avatar';
import { IconButton } from '../ui/IconButton';
import { copyToClipboard } from '../ui/copy';
import { toast } from '../ui/toast';
import { Row, Section, SettingsPage, useUpdateMe } from './parts';

/** Profile photos are stored as 512 × 512 JPEGs: small, square, and the same everywhere. */
const PHOTO_SIZE = 512;

/** Crops the middle square of the photo and scales it down, before it leaves the phone. */
async function squarePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(PHOTO_SIZE, side);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas');
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No blob'))),
      'image/jpeg',
      0.88,
    ),
  );
}

export function ProfileScreen() {
  const { t } = useTranslation();
  return (
    <RequireUser>
      {(me) => (
        <SettingsPage title={t('profile.title')}>
          <ProfilePanel me={me} />
        </SettingsPage>
      )}
    </RequireUser>
  );
}

/** A text setting that saves when you leave the field (or press Enter). */
function EditableField({
  id,
  icon: Icon,
  label,
  hint,
  value,
  maxLength,
  onSave,
}: {
  id: string;
  icon: typeof User;
  label: string;
  hint: string;
  value: string;
  maxLength: number;
  onSave: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  function save() {
    if (text.trim() !== value) onSave(text.trim());
  }
  return (
    <div className="flex items-start gap-5 px-6 py-3">
      <Icon size={22} aria-hidden="true" className="mt-6 shrink-0 text-text-muted" />
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="text-[0.8125rem] text-text-muted">
          {label}
        </label>
        <input
          id={id}
          value={text}
          maxLength={maxLength}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          aria-describedby={`${id}-hint`}
          className="w-full border-b border-black/15 py-1.5 text-[1rem] outline-none focus:border-b-2 focus:border-brand"
        />
        <p id={`${id}-hint`} className="mt-1 text-[0.75rem] text-text-muted">
          {hint} <span className="float-right">{maxLength - text.length}</span>
        </p>
      </div>
    </div>
  );
}

/** Settings → Profile: photo, name, about, and your number and address to copy. */
export function ProfilePanel({ me }: { me: Me }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  const updateMe = useUpdateMe();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const photo = await squarePhoto(file).catch(() => file); // odd formats: let the server decide
      const form = new FormData();
      form.append('file', photo, 'avatar.jpg');
      const updated = await api('/me/avatar', { method: 'POST', body: form, schema: meSchema });
      queryClient.setQueryData(['me'], updated);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast(t('profile.photoUpdated'));
    } catch (err) {
      toast(errorText(err));
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto() {
    try {
      const updated = await api('/me/avatar', { method: 'DELETE', schema: meSchema });
      queryClient.setQueryData(['me'], updated);
      toast(t('profile.photoRemoved'));
    } catch (err) {
      toast(errorText(err));
    }
  }

  async function copy(text: string) {
    toast((await copyToClipboard(text)) ? t('common.copied') : text);
  }

  return (
    <>
      <Section>
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="relative">
            <Avatar avatar={avatarFromMe(me)} size={144} />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              aria-label={t('profile.changePhoto')}
              className="absolute right-1 bottom-1 flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white shadow-md hover:bg-[#006e5a]"
            >
              {uploading ? (
                <Loader2 size={22} aria-hidden="true" className="animate-spin" />
              ) : (
                <Camera size={22} aria-hidden="true" />
              )}
            </button>
          </div>
          {me.avatarUrl && (
            <button
              type="button"
              onClick={() => void removePhoto()}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.875rem] text-danger hover:bg-black/5"
            >
              <Trash2 size={16} aria-hidden="true" />
              {t('profile.removePhoto')}
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={upload}
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>
      </Section>

      <Section>
        <EditableField
          id="profile-name"
          icon={User}
          label={t('profile.name')}
          hint={t('profile.nameHint')}
          value={me.displayName ?? ''}
          maxLength={60}
          onSave={(displayName) => void updateMe({ displayName: displayName || null })}
        />
        <EditableField
          id="profile-about"
          icon={Info}
          label={t('profile.about')}
          hint={t('profile.aboutHint')}
          value={me.about ?? ''}
          maxLength={140}
          onSave={(about) => void updateMe({ about: about || null })}
        />
      </Section>

      <Section>
        <Row icon={Phone} title={t('chatInfo.phone')} subtitle={me.phoneDisplay} />
        <Row
          icon={AtSign}
          title={t('chatInfo.address')}
          subtitle={me.address}
          trailing={
            <IconButton
              label={t('menu.copyAddress')}
              icon={Copy}
              onClick={() => void copy(me.address)}
            />
          }
        />
      </Section>
    </>
  );
}
