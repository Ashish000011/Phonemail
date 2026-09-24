import { beforeAll, describe, expect, it } from 'vitest';
import nodemailer from 'nodemailer';
import type { MailboxPage, Thread } from '@phonemail/shared';
import { eventually, SMTP_HOST, SMTP_PORT, stackIsUp, TestClient } from './client.js';

const up = await stackIsUp();

function smtp() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false,
    ignoreTLS: true,
  });
}

async function inboxItem(client: TestClient, subject: string) {
  return eventually(async () => {
    const { data } = await client.request<MailboxPage>('GET', '/api/mailbox/inbox');
    return data.items.find((i) => i.subject === subject);
  });
}

describe.skipIf(!up)('mail engine (against the running stack)', () => {
  let alice: TestClient;
  let bob: TestClient;

  beforeAll(async () => {
    alice = await TestClient.signIn('web');
    bob = await TestClient.signIn('web');
  });

  it('a new account has the welcome email', async () => {
    expect(await inboxItem(alice, 'Welcome to PhoneMail')).toBeTruthy();
  });

  it("A → B through the API lands in B's inbox, and B can reply exactly once", async () => {
    const subject = `Lunch ${Date.now()}`;
    const sent = await alice.request<{ messageId: string; conversationId: string }>(
      'POST',
      '/api/messages',
      { to: [bob.address], subject, body: 'Lunch at 1?' },
    );
    expect(sent.status).toBe(200);

    const item = await inboxItem(bob, subject);
    expect(item.from.address).toBe(alice.address);

    const first = await bob.request('POST', '/api/messages', {
      replyToMessageId: item.messageId,
      body: 'Sounds good!',
    });
    expect(first.status).toBe(200);

    const second = await bob.request<{ error: { code: string } }>('POST', '/api/messages', {
      replyToMessageId: item.messageId,
      body: 'Me again',
    });
    expect(second.status).toBe(422);
    expect(second.data.error.code).toBe('ALREADY_REPLIED');

    // Alice sees the reply in the same thread, with a "Re:" subject.
    const thread = await eventually(async () => {
      const { data } = await alice.request<Thread>(
        'GET',
        `/api/threads/${encodeURIComponent(item.threadId)}`,
      );
      return data.messages?.length === 2 ? data : undefined;
    });
    expect(thread.messages[1].subject).toBe(`Re: ${subject}`);
  });

  it('recipients are locked inside a chat', async () => {
    const sent = await alice.request<{ conversationId: string }>('POST', '/api/messages', {
      to: [bob.address],
      subject: 'hi',
      body: 'x',
    });
    const locked = await alice.request<{ error: { code: string } }>('POST', '/api/messages', {
      conversationId: sent.data.conversationId,
      to: ['someone@example.com'],
      body: 'sneaky',
    });
    expect(locked.status).toBe(422);
    expect(locked.data.error.code).toBe('RECIPIENTS_LOCKED');
  });

  it('sending to a number without PhoneMail says so', async () => {
    const result = await alice.request<{ error: { code: string } }>('POST', '/api/messages', {
      to: ['98765 00000'],
      body: 'hello?',
    });
    // Either unknown (422) or, if someone registered it, sent (200).
    if (result.status !== 200) expect(result.data.error.code).toBe('RECIPIENT_NOT_FOUND');
  });

  it('an outside sender can deliver over SMTP', async () => {
    const subject = `Newsletter ${Date.now()}`;
    await smtp().sendMail({
      from: 'news@example.com',
      to: alice.address,
      subject,
      text: 'Big news',
    });
    const item = await inboxItem(alice, subject);
    expect(item.from.address).toBe('news@example.com');
  });

  it('is not an open relay', async () => {
    await expect(
      smtp().sendMail({ from: 'x@example.com', to: 'y@example.org', subject: 's', text: 't' }),
    ).rejects.toThrow(/Relaying denied/);
  });

  it('nobody outside can pretend to be a PhoneMail user', async () => {
    await expect(
      smtp().sendMail({ from: bob.address, to: alice.address, subject: 's', text: 't' }),
    ).rejects.toThrow(/Authentication required/);
  });

  it('search finds mail by word and offers a chat for a phone number', async () => {
    const word = `zebra${Date.now()}`;
    await alice.request('POST', '/api/messages', {
      to: [bob.address],
      subject: 'Search me',
      body: `A ${word} walks in`,
    });
    const hits = await eventually(async () => {
      const { data } = await bob.request<{ messages: { highlight: string }[] }>(
        'GET',
        `/api/search?q=${word.slice(0, 8)}`,
      );
      return data.messages.length ? data.messages : undefined;
    });
    expect(hits[0].highlight).toContain('<mark>');

    const { data } = await bob.request<{ startChat: { address: string } | null }>(
      'GET',
      `/api/search?q=${encodeURIComponent(alice.address.split('@')[0])}`,
    );
    expect(data.startChat?.address).toBe(alice.address);
  });

  it('trash, restore and delete forever', async () => {
    const subject = `Trash me ${Date.now()}`;
    await alice.request('POST', '/api/messages', { to: [bob.address], subject, body: 'bye' });
    const item = await inboxItem(bob, subject);

    await bob.request('POST', '/api/entries/trash', { ids: item.entryIds });
    const trash = await bob.request<MailboxPage>('GET', '/api/mailbox/trash');
    expect(trash.data.items.some((i) => i.subject === subject)).toBe(true);

    await bob.request('POST', '/api/entries/restore', { ids: item.entryIds });
    expect(await inboxItem(bob, subject)).toBeTruthy();

    await bob.request('POST', '/api/entries/trash', { ids: item.entryIds });
    const gone = await bob.request<{ count: number }>('POST', '/api/entries/delete-forever', {
      ids: item.entryIds,
    });
    expect(gone.data.count).toBe(1);
  });
});
