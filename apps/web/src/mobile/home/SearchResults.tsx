import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MessageSquarePlus } from 'lucide-react';
import { conversationItemSchema, searchResponseSchema } from '@phonemail/shared';
import { api } from '../../shared/api';
import { useErrorText } from '../../shared/errors';
import { chatListTime } from '../../shared/time';
import { toast } from '../ui/toast';
import { ChatRow } from './ChatRow';

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * Search results in three sections (docs/spec/07-mobile-ui.md, "Search"):
 * chats, emails (matched words highlighted), and "Start a chat with …" when
 * the text is a phone number or an email address.
 */
export function SearchResults({ query }: { query: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  const q = useDebounced(query.trim(), 250);

  const results = useQuery({
    queryKey: ['search', q],
    queryFn: () => api(`/search?q=${encodeURIComponent(q)}`, { schema: searchResponseSchema }),
    enabled: q.length > 0,
    placeholderData: (previous) => previous,
  });

  const startChat = useMutation({
    mutationFn: (address: string) =>
      api('/conversations/resolve', {
        method: 'POST',
        body: { phoneOrAddress: address },
        schema: conversationItemSchema,
      }),
    onSuccess: (chat) => {
      queryClient.setQueryData(['conversation', chat.id], chat);
      navigate(`/m/chat/${chat.id}`);
    },
    onError: (err) => toast(errorText(err)),
  });

  const data = results.data;
  const empty = data && !data.conversations.length && !data.messages.length && !data.startChat;

  return (
    <div aria-live="polite" aria-busy={results.isFetching}>
      {data?.startChat && (
        <button
          type="button"
          onClick={() => startChat.mutate(data.startChat!.address)}
          disabled={startChat.isPending}
          className="flex min-h-[72px] w-full items-center gap-3 px-4 text-left hover:bg-black/[0.03]"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-white">
            <MessageSquarePlus size={22} aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-[1.0625rem]">
              {t('home.startChatWith', {
                who: data.startChat.phoneDisplay ?? data.startChat.address,
              })}
            </span>
            <span className="truncate text-[0.875rem] text-text-muted">
              {data.startChat.isPhoneMailUser
                ? (data.startChat.displayName ?? data.startChat.address)
                : data.startChat.phoneDisplay
                  ? t('home.notOnPhoneMail')
                  : data.startChat.address}
            </span>
          </span>
        </button>
      )}

      {!!data?.conversations.length && (
        <section aria-labelledby="search-chats">
          <h2 id="search-chats" className="px-4 pt-4 pb-1 text-[0.875rem] font-medium text-brand">
            {t('home.chats')}
          </h2>
          <ul>
            {data.conversations.map((chat) => (
              <ChatRow key={chat.id} chat={chat} onOpen={(c) => navigate(`/m/chat/${c.id}`)} />
            ))}
          </ul>
        </section>
      )}

      {!!data?.messages.length && (
        <section aria-labelledby="search-messages">
          <h2
            id="search-messages"
            className="px-4 pt-4 pb-1 text-[0.875rem] font-medium text-brand"
          >
            {t('home.messages')}
          </h2>
          <ul>
            {data.messages.map((hit) => (
              <li key={hit.entryId}>
                <button
                  type="button"
                  onClick={() => navigate(`/m/chat/${hit.conversationId}?focus=${hit.messageId}`)}
                  className="flex w-full flex-col gap-0.5 border-b border-black/[0.06] px-4 py-3 text-left hover:bg-black/[0.03]"
                >
                  <span className="flex items-baseline gap-2">
                    <span className="truncate font-medium">{hit.from.name}</span>
                    <span className="ml-auto shrink-0 text-[0.75rem] text-text-muted">
                      {chatListTime(hit.sentAt, i18n.language, t)}
                    </span>
                  </span>
                  {hit.subject && <span className="truncate text-[0.875rem]">{hit.subject}</span>}
                  {/* The server escapes the text and adds only <mark> around matches. */}
                  <span
                    className="line-clamp-2 text-[0.875rem] text-text-muted [&_mark]:rounded [&_mark]:bg-[#d9fdd3] [&_mark]:px-0.5 [&_mark]:text-text"
                    dangerouslySetInnerHTML={{ __html: hit.highlight }}
                  />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {empty && (
        <p className="px-8 py-12 text-center text-[0.9375rem] text-text-muted">
          {t('home.noResults', { query: q })}
        </p>
      )}
    </div>
  );
}
