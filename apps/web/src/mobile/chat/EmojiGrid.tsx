import { useTranslation } from 'react-i18next';
import { BottomSheet } from '../ui/BottomSheet';

/** A small built-in set; the phone keyboard has the rest (docs/DECISIONS.md #21). */
const EMOJI = [
  '😀',
  '😂',
  '🥹',
  '😊',
  '😍',
  '😘',
  '😎',
  '🤔',
  '😅',
  '😢',
  '😡',
  '🙏',
  '👍',
  '👎',
  '👏',
  '🙌',
  '💪',
  '🤝',
  '👋',
  '✌️',
  '❤️',
  '💚',
  '💯',
  '🔥',
  '🎉',
  '🎂',
  '🎁',
  '✅',
  '❌',
  '⭐',
  '📧',
  '📎',
  '📅',
  '📞',
  '🏠',
  '🚆',
  '☕',
  '🍛',
  '🌧️',
  '☀️',
];

export function EmojiGrid({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <BottomSheet open={open} onClose={onClose} title={t('chat.emoji')}>
      <div role="grid" className="grid grid-cols-8 gap-1">
        {EMOJI.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onPick(emoji)}
            className="flex h-11 items-center justify-center rounded-lg text-[1.6rem] hover:bg-black/5"
          >
            {emoji}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
