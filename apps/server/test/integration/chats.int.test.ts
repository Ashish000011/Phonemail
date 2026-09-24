import { beforeAll, describe, expect, it } from 'vitest';
import type { ChatMessagesPage, ConversationPage, DemoSms } from '@phonemail/shared';
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
});
