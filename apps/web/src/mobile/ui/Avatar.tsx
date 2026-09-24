import { User, Users } from 'lucide-react';
import type { Avatar as AvatarData } from '@phonemail/shared';

/**
 * A round avatar: a photo, colored initials, or WhatsApp's grey person or
 * people icon. Decorative: the name next to it is what screen readers read.
 */
export function Avatar({ avatar, size = 48 }: { avatar: AvatarData; size?: number }) {
  const style = { width: size, height: size };
  if (avatar.kind === 'photo' && avatar.url) {
    return (
      <img
        src={avatar.url}
        alt=""
        aria-hidden="true"
        style={style}
        className="shrink-0 rounded-full bg-app-bg object-cover"
      />
    );
  }
  if (avatar.kind === 'initials' && avatar.initials) {
    return (
      <span
        aria-hidden="true"
        style={{ ...style, backgroundColor: avatar.color, fontSize: size * 0.38 }}
        className="flex shrink-0 items-center justify-center rounded-full font-medium text-white"
      >
        {avatar.initials}
      </span>
    );
  }
  const Icon = avatar.kind === 'group' ? Users : User;
  return (
    <span
      aria-hidden="true"
      style={style}
      className="flex shrink-0 items-center justify-center rounded-full bg-[#dfe5e7] text-white"
    >
      <Icon size={size * 0.55} strokeWidth={2.2} fill="currentColor" />
    </span>
  );
}

/** The signed-in user's avatar (from /api/me), with initials from their name. */
export function avatarFromMe(me: {
  avatarUrl: string | null;
  displayName: string | null;
  id: string;
}): AvatarData {
  if (me.avatarUrl) return { kind: 'photo', url: me.avatarUrl, initials: '', color: '#0f766e' };
  const initials = (me.displayName ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0]?.toUpperCase() ?? '')
    .join('');
  return { kind: initials ? 'initials' : 'self', url: null, initials, color: '#0f766e' };
}
