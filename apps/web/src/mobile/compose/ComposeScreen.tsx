import { useNavigate, useSearchParams } from 'react-router';
import type { Me } from '@phonemail/shared';
import { RequireUser } from '../MobileShell';
import { useGoBack } from '../ui/useGoBack';
import { Composer } from './Composer';

export function ComposeScreen() {
  return <RequireUser>{(me) => <MobileCompose me={me} />}</RequireUser>;
}

/**
 * The full-screen composer. The mode comes from the link:
 * - /m/compose                              from Home: everything editable
 * - /m/compose?conversation=<id>            from a chat: recipients locked
 * - /m/compose?conversation=<id>&replyTo=…  a reply: locked, no subject, quote below
 * - /m/compose?draft=<id>                   continue a saved draft
 */
function MobileCompose({ me }: { me: Me }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const goBack = useGoBack();
  return (
    <Composer
      me={me}
      layout="screen"
      target={{
        draftId: params.get('draft'),
        conversationId: params.get('conversation'),
        replyToId: params.get('replyTo'),
        threadId: params.get('thread'),
      }}
      onClosed={goBack}
      // From a chat or the reader: back where you were. From Home: into the chat it went to.
      onSent={(conversationId, fromChat) =>
        fromChat ? goBack() : navigate(`/m/chat/${conversationId}`, { replace: true })
      }
    />
  );
}
