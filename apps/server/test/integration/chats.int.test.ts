import { beforeAll, describe, expect, it } from 'vitest';
import type {
  ChatMessagesPage,
  ConversationPage,
  DemoSms,
  MailboxPage,
  Thread,
} from '@phonemail/shared';
import { eventually, stackIsUp, TestClient } from './client.js';

const up = await stackIsUp();

describe.skipIf(!up)('chats, receipts and SMS alerts (against the running stack)', () => {
  let u: TestClient; // web user: gets SMS alerts
  let a: TestClient; // mobile user: no SMS alerts
  let b: TestClient;

  beforeAll(async () => {
    u = await TestClient.signIn('web');
    a = await TestClient.signIn('mobile');
    b = await TestClient.signIn('web');
  });

  async function send(from: TestClient, body: Record<string, unknown>) {
    const result = await from.request<{ conversationId: string; messageId: string }>(
      'POST',
      '/api/messages',
      { body: 'hello', ...body },
    );
    expect(result.status).toBe(200);
    return result.data;
  }

  it('2+ recipients from Home make a group; same people in any order reuse it; 1:1 stays 1:1', async () => {
    const first = await send(u, { to: [a.address, b.address], subject: 'Group plan' });
    const again = await send(u, { to: [b.address, a.address], subject: 'Same group' });
    expect(again.conversationId).toBe(first.conversationId);

    const direct = await send(u, { to: [a.address], subject: 'Just you' });
    expect(direct.conversationId).not.toBe(first.conversationId);

    const { data } = await u.request<ConversationPage>('GET', '/api/conversations');
    const group = data.items.find((c) => c.id === first.conversationId);
    expect(group?.kind).toBe('group');
    expect(group?.participants).toHaveLength(2);
  });

  it('a reply to a group email lands in the group for the recipient too', async () => {
    const sent = await send(u, { to: [a.address, b.address], subject: `Reply test ${Date.now()}` });
    const aChats = await eventually(async () => {
      const { data } = await a.request<ConversationPage>('GET', '/api/conversations');
      return data.items.find((c) => c.kind === 'group') ? data : undefined;
    });
    const aGroup = aChats.items.find((c) => c.kind === 'group')!;
    const messages = await a.request<ChatMessagesPage>(
      'GET',
      `/api/conversations/${aGroup.id}/messages`,
    );
    const target = messages.data.items.find((m) => m.messageId === sent.messageId)!;
    const reply = await send(a, {
      conversationId: aGroup.id,
      replyToMessageId: target.messageId,
      body: 'yes',
    });
    expect(reply.conversationId).toBe(aGroup.id);
  });

  it('inside a chat you cannot add people', async () => {
    const { conversationId } = await send(u, { to: [a.address], subject: 'locked' });
    const result = await u.request<{ error: { code: string } }>('POST', '/api/messages', {
      conversationId,
      cc: [b.address],
      body: 'x',
    });
    expect(result.data.error.code).toBe('RECIPIENTS_LOCKED');
  });

  it('blue ticks once the recipient opens the chat', async () => {
    const { conversationId, messageId } = await send(u, {
      to: [b.address],
      subject: `Ticks ${Date.now()}`,
    });
    const bChat = await eventually(async () => {
      const { data } = await b.request<ConversationPage>('GET', '/api/conversations?filter=unread');
      return data.items.find((c) => c.lastMessage?.messageId === messageId);
    });
    expect(bChat.unreadCount).toBeGreaterThan(0);
    await b.request('POST', `/api/conversations/${bChat.id}/read`);

    const state = await eventually(async () => {
      const { data } = await u.request<ChatMessagesPage>(
        'GET',
        `/api/conversations/${conversationId}/messages`,
      );
      const mine = data.items.find((m) => m.messageId === messageId);
      return mine?.deliveryState === 'read' ? mine.deliveryState : undefined;
    });
    expect(state).toBe('read');
  });

  it('SMS alert only for users without a mobile session', async () => {
    const subjectForWeb = `Alert web ${Date.now()}`;
    const subjectForMobile = `Alert mobile ${Date.now()}`;
    await send(b, { to: [u.address], subject: subjectForWeb });
    await send(b, { to: [a.address], subject: subjectForMobile });

    const feed = async () => (await u.request<DemoSms[]>('GET', '/api/demo/sms?limit=200')).data;
    const alert = await eventually(async () =>
      (await feed()).find((s) => s.purpose === 'notification' && s.body.includes(subjectForWeb)),
    );
    expect(alert.toE164).toBe(u.phoneE164);
    expect(alert.body).toMatch(/^You have received an email from .+\. Subject: Alert web \d+\.$/);

    // Give the worker the same time to (not) send the mobile user's alert.
    await new Promise((r) => setTimeout(r, 3000));
    expect((await feed()).some((s) => s.body.includes(subjectForMobile))).toBe(false);
  });

  it('search a number to start a chat', async () => {
    const local = b.address.split('@')[0];
    const { data } = await u.request<{ id: string; kind: string }>(
      'POST',
      '/api/conversations/resolve',
      {
        phoneOrAddress: local,
      },
    );
    expect(data.kind).toBe('direct');
  });

  it('reporting a chat you replied in hides all of it; Not spam brings all of it back', async () => {
    const sender = await TestClient.signIn('web');
    const subject = `Just a trial ${Date.now()}`;
    const first = await send(sender, { to: [b.address], subject });
    const chat = await eventually(async () => {
      const { data } = await b.request<ConversationPage>('GET', '/api/conversations');
      return data.items.find((c) => c.participants.some((p) => p.address === sender.address));
    });
    // b's own reply sits in the chat too; it used to keep the chat on Home.
    await send(b, { conversationId: chat.id, replyToMessageId: first.messageId, body: 'ok' });
    expect((await b.request('POST', `/api/conversations/${chat.id}/spam`)).status).toBe(204);

    const chats = await b.request<ConversationPage>('GET', '/api/conversations');
    expect(chats.data.items.some((c) => c.id === chat.id)).toBe(false);
    // The phone's Spam screen shows the chat once, not email by email.
    const spamChats = await b.request<ConversationPage['items']>('GET', '/api/conversations/spam');
    expect(spamChats.data.filter((c) => c.id === chat.id)).toHaveLength(1);
    const spam = await b.request<MailboxPage>('GET', '/api/mailbox/spam');
    const thread = spam.data.items.find((i) => i.subject.endsWith(subject));
    expect(thread?.count).toBe(2);

    // "Not spam" on the received email alone restores b's reply as well.
    const { data: full } = await b.request<Thread>('GET', `/api/threads/${thread!.threadId}`);
    const received = full.messages.find((m) => m.from.address === sender.address)!;
    const restore = await b.request('POST', '/api/entries/not-spam', { ids: [received.entryId] });
    expect(restore.status).toBe(204);
    const messages = await b.request<ChatMessagesPage>(
      'GET',
      `/api/conversations/${chat.id}/messages`,
    );
    expect(messages.data.items).toHaveLength(2);
  });

  it('Not spam on a whole chat brings back all its mail and unblocks its people', async () => {
    const sender = await TestClient.signIn('web');
    const first = await send(sender, { to: [b.address], subject: `Oops ${Date.now()}` });
    const chat = await eventually(async () => {
      const { data } = await b.request<ConversationPage>('GET', '/api/conversations');
      return data.items.find((c) => c.participants.some((p) => p.address === sender.address));
    });
    await send(b, { conversationId: chat.id, replyToMessageId: first.messageId, body: 'hi' });
    await b.request('POST', `/api/conversations/${chat.id}/spam`);

    const restore = await b.request('POST', `/api/conversations/${chat.id}/not-spam`);
    expect(restore.status).toBe(204);
    const chats = await b.request<ConversationPage>('GET', '/api/conversations');
    expect(chats.data.items.some((c) => c.id === chat.id)).toBe(true);
    const messages = await b.request<ChatMessagesPage>(
      'GET',
      `/api/conversations/${chat.id}/messages`,
    );
    expect(messages.data.items).toHaveLength(2);
    const blocked = await b.request<{ address: string }[]>('GET', '/api/me/blocked');
    expect(blocked.data.some((s) => s.address === sender.address)).toBe(false);
    const spamChats = await b.request<ConversationPage['items']>('GET', '/api/conversations/spam');
    expect(spamChats.data.some((c) => c.id === chat.id)).toBe(false);
  });

  it('report spam blocks the sender; Settings lists them and can unblock', async () => {
    const spammer = await TestClient.signIn('web');
    await send(spammer, { to: [b.address], subject: 'Win a prize' });
    const chat = await eventually(async () => {
      const { data } = await b.request<ConversationPage>('GET', '/api/conversations');
      return data.items.find((c) => c.participants.some((p) => p.address === spammer.address));
    });
    expect(chat).toBeDefined();
    expect((await b.request('POST', `/api/conversations/${chat.id}/spam`)).status).toBe(204);

    const blocked = await b.request<{ id: string; address: string }[]>('GET', '/api/me/blocked');
    const entry = blocked.data.find((s) => s.address === spammer.address);
    expect(entry).toBeDefined();

    expect((await b.request('DELETE', `/api/me/blocked/${entry!.id}`)).status).toBe(204);
    const after = await b.request<{ address: string }[]>('GET', '/api/me/blocked');
    expect(after.data.some((s) => s.address === spammer.address)).toBe(false);
    // Someone else's block can't be removed.
    expect((await u.request('DELETE', `/api/me/blocked/${entry!.id}`)).status).toBe(404);
  });

  it('fromAliasId null sends from the primary address even when an alias is the default', async () => {
    const localPart = `pm${Date.now().toString(36)}`;
    const alias = await u.request<{ id: string }>('POST', '/api/aliases', { localPart });
    expect(alias.status).toBe(201);
    await u.request('PATCH', '/api/me', { defaultSendAsAliasId: alias.data.id });

    const subject = `From test ${Date.now()}`;
    const primary = await send(u, { to: [a.address], subject, fromAliasId: null });
    const viaDefault = await send(u, { to: [a.address], subject: `${subject} (default)` });
    await u.request('PATCH', '/api/me', { defaultSendAsAliasId: null });

    // Aliases collapse into one person, so both land in the same chat.
    expect(viaDefault.conversationId).toBe(primary.conversationId);
    const received = await eventually(async () => {
      const { data } = await a.request<ConversationPage>('GET', '/api/conversations');
      const chat = data.items.find(
        (c) => c.kind === 'direct' && c.participants.some((p) => p.address === u.address),
      );
      if (!chat) return undefined;
      const page = await a.request<ChatMessagesPage>(
        'GET',
        `/api/conversations/${chat.id}/messages`,
      );
      const mine = page.data.items.filter((m) => m.subject.startsWith(subject));
      return mine.length === 2 ? mine : undefined;
    });
    const fromOf = (s: string) => received.find((m) => m.subject === s)?.from.address;
    expect(fromOf(subject)).toBe(u.address);
    expect(fromOf(`${subject} (default)`)).toBe(`${localPart}@${u.address.split('@')[1]}`);
  });
});
