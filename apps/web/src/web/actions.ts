import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../shared/api';
import { useErrorText } from '../shared/errors';
import { toast } from '../mobile/ui/toast';

/** Lists and views an action on emails can change, in both clients. */
const AFFECTED = [['mailbox'], ['mailbox-counts'], ['thread'], ['conversations'], ['messages']];

/**
 * The toolbar and shortcut actions on mailbox entries (docs/spec/04,
 * "Folders and flags"). They take entry ids, so a whole thread (all its
 * copies in this folder) moves together.
 */
export function useEntryActions() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const errorText = useErrorText();

  async function run(request: () => Promise<unknown>, done?: string): Promise<boolean> {
    try {
      await request();
      if (done) toast(done);
      return true;
    } catch (err) {
      toast(errorText(err));
      return false;
    } finally {
      for (const queryKey of AFFECTED) void queryClient.invalidateQueries({ queryKey });
    }
  }

  const post = (path: string, body: unknown) => () => api(path, { method: 'POST', body });

  return {
    setRead: (ids: string[], isRead: boolean) =>
      run(() => api('/entries', { method: 'PATCH', body: { ids, isRead } })),
    setStarred: (ids: string[], isStarred: boolean) =>
      run(() => api('/entries', { method: 'PATCH', body: { ids, isStarred } })),
    trash: (ids: string[]) => run(post('/entries/trash', { ids }), t('home.movedToTrash')),
    restore: (ids: string[]) => run(post('/entries/restore', { ids }), t('folders.restored')),
    deleteForever: (ids: string[]) =>
      run(post('/entries/delete-forever', { ids }), t('web.deletedForever')),
    spam: (ids: string[]) =>
      run(post('/entries/spam', { ids, blockSender: true }), t('home.reportedSpam')),
    notSpam: (ids: string[]) => run(post('/entries/not-spam', { ids }), t('web.notSpamDone')),
    emptyTrash: () => run(post('/trash/empty', undefined), t('folders.trashEmptied')),
  };
}
