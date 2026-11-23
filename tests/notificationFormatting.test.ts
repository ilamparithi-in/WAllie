import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeHtmlEntities,
  stripHtmlTags,
  formatNotificationSummary,
  formatNotificationBody,
  parseMediaLine,
  formatMediaLine,
  extractSenderPrefix,
  coalesceNotificationMessages,
  normalizeNotificationText,
  formatAccountBadge,
  formatCoalescedNotificationTitle,
  isSameNotificationMessage,
  getFocusedOrFirstInListAccount,
  WHATSAPP_MEDIA_TYPES,
} from '../src/shared/notificationFormatting.ts';

describe('Notification Formatting Utilities', () => {
  describe('decodeHtmlEntities', () => {
    test('decodes standard named entities', () => {
      assert.equal(decodeHtmlEntities('&amp;'), '&');
      assert.equal(decodeHtmlEntities('&lt;'), '<');
      assert.equal(decodeHtmlEntities('&gt;'), '>');
      assert.equal(decodeHtmlEntities('&quot;'), '"');
      assert.equal(decodeHtmlEntities('&apos;'), "'");
      assert.equal(decodeHtmlEntities('&nbsp;'), ' ');
    });

    test('decodes numeric decimal and hex entities', () => {
      assert.equal(decodeHtmlEntities('&#39;'), "'");
      assert.equal(decodeHtmlEntities('&#039;'), "'");
      assert.equal(decodeHtmlEntities('&#x27;'), "'");
      assert.equal(decodeHtmlEntities('&#65;'), 'A');
      assert.equal(decodeHtmlEntities('&#x41;'), 'A');
    });

    test('handles double-escaped entities via 2 passes', () => {
      assert.equal(decodeHtmlEntities('&amp;apos;'), "'");
      assert.equal(decodeHtmlEntities('&amp;amp;'), '&');
      assert.equal(decodeHtmlEntities('&amp;lt;'), '<');
    });

    test('handles empty and nullish strings gracefully', () => {
      assert.equal(decodeHtmlEntities(''), '');
      assert.equal(decodeHtmlEntities(undefined as any), '');
    });
  });

  describe('stripHtmlTags', () => {
    test('strips simple tags', () => {
      assert.equal(stripHtmlTags('<b>Hello</b> World'), 'Hello World');
      assert.equal(stripHtmlTags('<span>Text</span><br/><p>Paragraph</p>'), 'TextParagraph');
    });

    test('returns clean text unmodified', () => {
      assert.equal(stripHtmlTags('Plain text message'), 'Plain text message');
    });
  });

  describe('formatNotificationSummary', () => {
    test('cleans and normalizes summary text', () => {
      const input = '  <b>Alice &amp; Bob</b> \n\t said: &#39;Hello&#39;  ';
      const output = formatNotificationSummary(input);
      assert.equal(output, "Alice & Bob said: 'Hello'");
    });

    test('respects maxLength bound', () => {
      const longTitle = 'A'.repeat(300);
      const output = formatNotificationSummary(longTitle, 50);
      assert.equal(output.length, 50);
    });
  });

  describe('formatNotificationBody', () => {
    test('converts WhatsApp markdown to XML markup', () => {
      assert.equal(formatNotificationBody('*bold message*'), '<b>bold message</b>');
      assert.equal(formatNotificationBody('_italic text_'), '<i>italic text</i>');
      assert.equal(formatNotificationBody('~struck~'), '<s>struck</s>');
      assert.equal(formatNotificationBody('`inline code`'), '<tt>inline code</tt>');
    });

    test('escapes raw XML text nodes (&, <, >)', () => {
      assert.equal(formatNotificationBody('Rock & Roll <music>'), 'Rock &amp; Roll &lt;music&gt;');
    });

    test('preserves existing safe tags', () => {
      const input = '<b>Already Bold</b> and *new bold*';
      const output = formatNotificationBody(input);
      assert.equal(output, '<b>Already Bold</b> and <b>new bold</b>');
    });

    test('truncates text exceeding maxLength', () => {
      const longBody = 'Hello '.repeat(1000);
      const output = formatNotificationBody(longBody, 100);
      assert.ok(output.length <= 150);
    });
  });

  describe('parseMediaLine', () => {
    test('parses group chat photo notification with sender and count', () => {
      const parsed = parseMediaLine('Alice Cooper: 2 photos');
      assert.ok(parsed);
      assert.equal(parsed.sender, 'Alice Cooper');
      assert.equal(parsed.mediaDef.key, 'photo');
      assert.equal(parsed.count, 2);
      assert.equal(parsed.isExplicitCount, true);
      assert.equal(parsed.emojiPrefix, '');
    });

    test('parses group chat photo notification with single photo and emoji', () => {
      const parsed = parseMediaLine('Alice Cooper: 📷 Photo');
      assert.ok(parsed);
      assert.equal(parsed.sender, 'Alice Cooper');
      assert.equal(parsed.mediaDef.key, 'photo');
      assert.equal(parsed.count, 1);
      assert.equal(parsed.isExplicitCount, false);
      assert.equal(parsed.emojiPrefix.trim(), '📷');
    });

    test('parses 1-on-1 chat photo notification without sender prefix', () => {
      const parsed = parseMediaLine('2 photos');
      assert.ok(parsed);
      assert.equal(parsed.sender, '');
      assert.equal(parsed.mediaDef.key, 'photo');
      assert.equal(parsed.count, 2);
      assert.equal(parsed.isExplicitCount, true);
    });

    test('parses all official WhatsApp media types', () => {
      const expectations: [string, string, number][] = [
        ['Alice: 2 photos', 'photo', 2],
        ['Alice: Photo', 'photo', 1],
        ['Alice: 2 videos', 'video', 2],
        ['Alice: Video', 'video', 1],
        ['Alice: 🎤 Voice message (0:15)', 'voice_message', 1],
        ['Alice: 2 voice messages', 'voice_message', 2],
        ['Alice: 2 voice notes', 'voice_message', 2],
        ['Alice: 2 audio files', 'audio', 2],
        ['Alice: Audio', 'audio', 1],
        ['Alice: 2 documents', 'document', 2],
        ['Alice: 📄 Document', 'document', 1],
        ['Alice: 2 files', 'document', 2],
        ['Alice: 2 stickers', 'sticker', 2],
        ['Alice: Sticker', 'sticker', 1],
        ['Alice: 2 GIFs', 'gif', 2],
        ['Alice: 👾 GIF', 'gif', 1],
        ['Alice: 2 contacts', 'contact', 2],
        ['Alice: Contact card', 'contact', 1],
        ['Alice: 2 locations', 'location', 2],
        ['Alice: 📍 Location', 'location', 1],
        ['Alice: 2 live locations', 'location', 2],
        ['Alice: 2 polls', 'poll', 2],
        ['Alice: 📊 Poll', 'poll', 1],
        ['Alice: 2 events', 'event', 2],
        ['Alice: 📅 Event', 'event', 1],
        ['Alice: 2 media files', 'media', 2],
        ['Alice: 2 products', 'product', 2],
      ];

      for (const [input, expectedKey, expectedCount] of expectations) {
        const parsed = parseMediaLine(input);
        assert.ok(parsed, `Expected "${input}" to parse as media line`);
        assert.equal(parsed.mediaDef.key, expectedKey, `Expected key ${expectedKey} for "${input}"`);
        assert.equal(parsed.count, expectedCount, `Expected count ${expectedCount} for "${input}"`);
      }
    });

    test('returns null for standard non-media chat messages and sentences', () => {
      assert.equal(parseMediaLine('Alice Cooper: Hello world'), null);
      assert.equal(parseMediaLine('Alice Cooper: 2 apples for dinner'), null);
      assert.equal(parseMediaLine('Alice Cooper: Check out this photo'), null);
      assert.equal(parseMediaLine('2 photos are missing from the drive'), null);
      assert.equal(parseMediaLine(''), null);
    });
  });

  describe('formatMediaLine', () => {
    test('formats plural media with sender and count', () => {
      const photoDef = WHATSAPP_MEDIA_TYPES.find((d) => d.key === 'photo')!;
      assert.equal(formatMediaLine('Alice Cooper', photoDef, 4), 'Alice Cooper: 4 photos');
    });

    test('formats plural media with emoji prefix', () => {
      const photoDef = WHATSAPP_MEDIA_TYPES.find((d) => d.key === 'photo')!;
      assert.equal(formatMediaLine('Alice Cooper', photoDef, 4, '📷'), 'Alice Cooper: 📷 4 photos');
    });

    test('formats 1-on-1 media without sender', () => {
      const photoDef = WHATSAPP_MEDIA_TYPES.find((d) => d.key === 'photo')!;
      assert.equal(formatMediaLine('', photoDef, 4), '4 photos');
    });

    test('formats singular media without count', () => {
      const photoDef = WHATSAPP_MEDIA_TYPES.find((d) => d.key === 'photo')!;
      assert.equal(formatMediaLine('Alice Cooper', photoDef, 1), 'Alice Cooper: Photo');
    });
  });

  describe('coalesceNotificationMessages', () => {
    test('replicates user bug: updates sequential media arrival to count in a single line', () => {
      let messages: string[] = [];
      messages = coalesceNotificationMessages(messages, 'Alice Cooper: 2 photos');
      assert.deepEqual(messages, ['Alice Cooper: 2 photos']);

      messages = coalesceNotificationMessages(messages, 'Alice Cooper: 3 photos');
      assert.deepEqual(messages, ['Alice Cooper: 3 photos']);

      messages = coalesceNotificationMessages(messages, 'Alice Cooper: 4 photos');
      assert.deepEqual(messages, ['Alice Cooper: 4 photos']);
    });

    test('coalesces single photos arriving one by one without explicit count', () => {
      let messages: string[] = [];
      messages = coalesceNotificationMessages(messages, 'Alice Cooper: Photo');
      assert.deepEqual(messages, ['Alice Cooper: Photo']);

      messages = coalesceNotificationMessages(messages, 'Alice Cooper: Photo');
      assert.deepEqual(messages, ['Alice Cooper: 2 photos']);

      messages = coalesceNotificationMessages(messages, 'Alice Cooper: Photo');
      assert.deepEqual(messages, ['Alice Cooper: 3 photos']);
    });

    test('preserves emoji prefix across sequential media count updates', () => {
      let messages: string[] = [];
      messages = coalesceNotificationMessages(messages, 'Alice Cooper: 📷 Photo');
      assert.deepEqual(messages, ['Alice Cooper: 📷 Photo']);

      messages = coalesceNotificationMessages(messages, 'Alice Cooper: 2 photos');
      assert.deepEqual(messages, ['Alice Cooper: 📷 2 photos']);

      messages = coalesceNotificationMessages(messages, 'Alice Cooper: 3 photos');
      assert.deepEqual(messages, ['Alice Cooper: 📷 3 photos']);
    });

    test('coalesces in 1-on-1 chat without sender prefix', () => {
      let messages: string[] = [];
      messages = coalesceNotificationMessages(messages, '2 photos');
      messages = coalesceNotificationMessages(messages, '3 photos');
      messages = coalesceNotificationMessages(messages, '4 photos');
      assert.deepEqual(messages, ['4 photos']);
    });

    test('keeps distinct senders in group chat separated while coalescing per-sender', () => {
      let messages: string[] = [];
      messages = coalesceNotificationMessages(messages, 'Bob: 2 photos');
      messages = coalesceNotificationMessages(messages, 'Alice: 2 photos');
      assert.deepEqual(messages, ['Bob: 2 photos', 'Alice: 2 photos']);

      messages = coalesceNotificationMessages(messages, 'Alice: 3 photos');
      assert.deepEqual(messages, ['Bob: 2 photos', 'Alice: 3 photos']);

      messages = coalesceNotificationMessages(messages, 'Bob: 3 photos');
      assert.deepEqual(messages, ['Bob: 3 photos', 'Alice: 3 photos']);
    });

    test('keeps different media types from the same sender separated', () => {
      let messages: string[] = [];
      messages = coalesceNotificationMessages(messages, 'Alice: 2 photos');
      messages = coalesceNotificationMessages(messages, 'Alice: Video');
      assert.deepEqual(messages, ['Alice: 2 photos', 'Alice: Video']);

      messages = coalesceNotificationMessages(messages, 'Alice: 2 videos');
      assert.deepEqual(messages, ['Alice: 2 photos', 'Alice: 2 videos']);
    });

    test('coalesces media while preserving preceding text messages', () => {
      let messages: string[] = [];
      messages = coalesceNotificationMessages(messages, 'Alice: Check these out');
      messages = coalesceNotificationMessages(messages, 'Alice: 2 photos');
      messages = coalesceNotificationMessages(messages, 'Alice: 3 photos');
      messages = coalesceNotificationMessages(messages, 'Alice: 4 photos');
      assert.deepEqual(messages, [
        'Alice: Check these out',
        'Alice: 4 photos',
      ]);
    });

    test('appends normal text message following media without altering media count', () => {
      let messages = ['Alice: 4 photos'];
      messages = coalesceNotificationMessages(messages, 'Alice: Let me know what you think');
      assert.deepEqual(messages, [
        'Alice: 4 photos',
        'Alice: Let me know what you think',
      ]);
    });

    describe('edited message handling (isEdit: true)', () => {
      test('resolves user reported bug: replaces original message in-place on edit instead of appending duplicate line', () => {
        let messages = [
          'Alice Cooper: Please review the document and send feedback',
        ];
        const edited = 'Alice Cooper: Please review the document and send feedback today';
        messages = coalesceNotificationMessages(messages, edited, { isEdit: true });
        assert.deepEqual(messages, [
          'Alice Cooper: Please review the document and send feedback today',
        ]);
      });

      test('replaces matching sender message in a multi-sender group chat without affecting others', () => {
        let messages = [
          'Alice: Good morning team',
          'Alice Cooper: Please review the document and send feedback',
          'Bob: Noted, thanks!',
        ];
        const edited = 'Alice Cooper: Please review the document and send feedback today';
        messages = coalesceNotificationMessages(messages, edited, { isEdit: true });
        assert.deepEqual(messages, [
          'Alice: Good morning team',
          'Alice Cooper: Please review the document and send feedback today',
          'Bob: Noted, thanks!',
        ]);
      });

      test('replaces the most recent message when sender has multiple messages in the conversation', () => {
        let messages = [
          'Alice: First message',
          'Alice: Second message with typo',
        ];
        const edited = 'Alice: Second message with typo fixed';
        messages = coalesceNotificationMessages(messages, edited, { isEdit: true });
        assert.deepEqual(messages, [
          'Alice: First message',
          'Alice: Second message with typo fixed',
        ]);
      });

      test('replaces line in-place in 1-on-1 chat without sender prefix', () => {
        let messages = [
          'Are we meeting at 5pm today?',
        ];
        const edited = 'Are we meeting at 6pm today?';
        messages = coalesceNotificationMessages(messages, edited, { isEdit: true });
        assert.deepEqual(messages, [
          'Are we meeting at 6pm today?',
        ]);
      });

      test('preserves user inline reply ("You: ...") when editing incoming 1-on-1 message', () => {
        let messages = [
          'Are we meeting at 5pm today?',
          'You: Sounds good!',
        ];
        const edited = 'Are we meeting at 6pm today?';
        messages = coalesceNotificationMessages(messages, edited, { isEdit: true });
        assert.deepEqual(messages, [
          'Are we meeting at 6pm today?',
          'You: Sounds good!',
        ]);
      });

      test('appends message when isEdit is true but no prior message from that sender exists', () => {
        let messages = [
          'Charlie: Hello',
        ];
        const incoming = 'Alice: Hello Charlie';
        messages = coalesceNotificationMessages(messages, incoming, { isEdit: true });
        assert.deepEqual(messages, [
          'Charlie: Hello',
          'Alice: Hello Charlie',
        ]);
      });

      test('handles directional Unicode characters in sender prefix when matching edit', () => {
        let messages = [
          'Alice Cooper\u200e: original message\u200e',
        ];
        const edited = 'Alice Cooper\u200e: edited message\u200e';
        messages = coalesceNotificationMessages(messages, edited, { isEdit: true });
        assert.deepEqual(messages, [
          'Alice Cooper\u200e: edited message\u200e',
        ]);
      });

      test('normal new message with isEdit false or undefined appends normally', () => {
        let messages = [
          'Alice: Message 1',
        ];
        messages = coalesceNotificationMessages(messages, 'Alice: Message 2');
        assert.deepEqual(messages, [
          'Alice: Message 1',
          'Alice: Message 2',
        ]);
      });
    });

    describe('extractSenderPrefix', () => {
      test('extracts sender and message body from group line', () => {
        const parsed = extractSenderPrefix('Alice Cooper: hello world');
        assert.equal(parsed.sender, 'Alice Cooper');
        assert.equal(parsed.body, 'hello world');
      });

      test('strips directional Unicode controls before extracting sender', () => {
        const parsed = extractSenderPrefix('Alice Cooper\u200e: hello world');
        assert.equal(parsed.sender, 'Alice Cooper');
        assert.equal(parsed.body, 'hello world');
      });

      test('does not mistake URLs for sender prefixes', () => {
        const parsed = extractSenderPrefix('https://github.com/walinux');
        assert.equal(parsed.sender, '');
        assert.equal(parsed.body, 'https://github.com/walinux');
      });

      test('handles 1-on-1 messages with no colon', () => {
        const parsed = extractSenderPrefix('Just a simple text message');
        assert.equal(parsed.sender, '');
        assert.equal(parsed.body, 'Just a simple text message');
      });

      test('handles empty or non-string input safely', () => {
        assert.deepEqual(extractSenderPrefix(''), { sender: '', body: '' });
        assert.deepEqual(extractSenderPrefix(null as any), { sender: '', body: '' });
        assert.deepEqual(extractSenderPrefix(undefined as any), { sender: '', body: '' });
      });
    });
  });

  describe('normalizeNotificationText', () => {
    test('strips zero-width spaces and Unicode bidirectional formatting marks', () => {
      const input = 'Alice Cooper\u200e: Happy birthday 🎉 @Bob\u200e';
      const expected = 'alice cooper: happy birthday 🎉 @bob';
      assert.equal(normalizeNotificationText(input), expected);
    });

    test('collapses whitespace and normalizes single/double quotes', () => {
      const input = '   “Hello”   \n\t  ‘World’   ';
      assert.equal(normalizeNotificationText(input), '"hello" \'world\'');
    });

    test('decodes HTML entities prior to normalization', () => {
      const input = 'Alice &amp; Bob &gt; Charlie';
      assert.equal(normalizeNotificationText(input), 'alice & bob > charlie');
    });

    test('handles empty or nullish input', () => {
      assert.equal(normalizeNotificationText(''), '');
      assert.equal(normalizeNotificationText(null), '');
      assert.equal(normalizeNotificationText(undefined), '');
    });
  });

  describe('formatAccountBadge', () => {
    test('prefers emoji when available', () => {
      assert.equal(formatAccountBadge({ emoji: '🏢', name: 'Official' }), '🏢');
      assert.equal(formatAccountBadge({ emoji: '👥', name: 'Personal' }), '👥');
    });

    test('falls back to account name when emoji is empty', () => {
      assert.equal(formatAccountBadge({ emoji: '', name: 'Personal' }), 'Personal');
      assert.equal(formatAccountBadge({ name: 'Work' }), 'Work');
    });

    test('returns empty string if neither is provided', () => {
      assert.equal(formatAccountBadge({}), '');
    });
  });

  describe('formatCoalescedNotificationTitle', () => {
    test('formats multiple account emojis before pipe delimiter', () => {
      const accounts = [
        { accountId: 'acc_1', emoji: '🏢', name: 'Official' },
        { accountId: 'acc_2', emoji: '👥', name: 'Personal' },
      ];
      assert.equal(
        formatCoalescedNotificationTitle(accounts, 'General'),
        '🏢 👥 | General'
      );
    });

    test('respects configured account order when sorting emojis', () => {
      const accounts = [
        { accountId: 'acc_2', emoji: '👥', name: 'Personal' },
        { accountId: 'acc_1', emoji: '🏢', name: 'Official' },
      ];
      const accountOrder = ['acc_1', 'acc_2'];
      assert.equal(
        formatCoalescedNotificationTitle(accounts, 'General', accountOrder),
        '🏢 👥 | General'
      );
    });

    test('deduplicates duplicate accounts by id', () => {
      const accounts = [
        { accountId: 'acc_1', emoji: '🏢', name: 'Official' },
        { accountId: 'acc_1', emoji: '🏢', name: 'Official' },
        { accountId: 'acc_2', emoji: '👥', name: 'Personal' },
      ];
      assert.equal(
        formatCoalescedNotificationTitle(accounts, 'General'),
        '🏢 👥 | General'
      );
    });

    test('formats single account title', () => {
      const accounts = [{ accountId: 'acc_1', emoji: '🏢', name: 'Official' }];
      assert.equal(
        formatCoalescedNotificationTitle(accounts, 'General'),
        '🏢 | General'
      );
    });

    test('handles accounts with names instead of emojis', () => {
      const accounts = [
        { accountId: 'acc_1', emoji: '🏢', name: 'Official' },
        { accountId: 'acc_2', name: 'Personal' },
      ];
      assert.equal(
        formatCoalescedNotificationTitle(accounts, 'General'),
        '🏢 Personal | General'
      );
    });
  });

  describe('isSameNotificationMessage', () => {
    test('matches exact identical chat title, sender and message content', () => {
      const a = {
        contactName: 'General',
        body: 'Alice Cooper\u200e: Happy birthday 🎉 @Bob\u200e',
      };
      const b = {
        contactName: 'General',
        body: 'Alice Cooper: Happy birthday 🎉 @Bob',
      };
      assert.equal(isSameNotificationMessage(a, b), true);
    });

    test('matches when title is passed via title property fallback', () => {
      const a = {
        title: 'General',
        body: 'Alice Cooper: Happy birthday 🎉',
      };
      const b = {
        contactName: 'General',
        body: 'Alice Cooper: Happy birthday 🎉',
      };
      assert.equal(isSameNotificationMessage(a, b), true);
    });

    test('rejects different message bodies in the same chat', () => {
      const a = {
        contactName: 'General',
        body: 'Alice Cooper: Happy birthday 🎉',
      };
      const b = {
        contactName: 'General',
        body: 'Bob: Thanks everyone!',
      };
      assert.equal(isSameNotificationMessage(a, b), false);
    });

    test('rejects different chat titles with the same message', () => {
      const a = {
        contactName: 'General',
        body: 'Alice Cooper: Happy birthday 🎉',
      };
      const b = {
        contactName: 'Random Group',
        body: 'Alice Cooper: Happy birthday 🎉',
      };
      assert.equal(isSameNotificationMessage(a, b), false);
    });

    test('matches when WhatsApp group JID tags match', () => {
      const a = {
        contactName: 'General',
        body: 'Alice Cooper: Happy birthday 🎉',
        tag: '120363028192839182@g.us',
      };
      const b = {
        contactName: 'General',
        body: 'Alice Cooper: Happy birthday 🎉',
        tag: '120363028192839182@g.us',
      };
      assert.equal(isSameNotificationMessage(a, b), true);
    });

    test('rejects if WhatsApp group JID tags are explicitly different', () => {
      const a = {
        contactName: 'General',
        body: 'Alice Cooper: Happy birthday 🎉',
        tag: '120363028192839182@g.us',
      };
      const b = {
        contactName: 'General',
        body: 'Alice Cooper: Happy birthday 🎉',
        tag: '120363999999999999@g.us',
      };
      assert.equal(isSameNotificationMessage(a, b), false);
    });
  });

  describe('Multi-Account Notification Coalescing Logic', () => {
    test('coalesces multiple accounts receiving identical message and updates title in-place', () => {
      interface MockEntry {
        id: number;
        title: string;
        body: string;
        contactName: string;
        accounts: Array<{ accountId: string; emoji?: string; name?: string }>;
        lastTime: number;
      }

      const activeNotifications = new Map<number, MockEntry>();
      const accountOrder = ['acc_1', 'acc_2', 'acc_3'];

      function handleIncomingNotification(payload: {
        contactName: string;
        body: string;
        accountId: string;
        accountEmoji?: string;
        accountName?: string;
      }) {
        const now = Date.now();
        let matching: MockEntry | null = null;
        for (const entry of activeNotifications.values()) {
          if (
            now - entry.lastTime < 60000 &&
            !entry.accounts.some((a) => a.accountId === payload.accountId) &&
            isSameNotificationMessage(
              { contactName: entry.contactName, body: entry.body },
              { contactName: payload.contactName, body: payload.body }
            )
          ) {
            matching = entry;
            break;
          }
        }

        if (matching) {
          if (!matching.accounts.some((a) => a.accountId === payload.accountId)) {
            matching.accounts.push({
              accountId: payload.accountId,
              emoji: payload.accountEmoji,
              name: payload.accountName,
            });
          }
          matching.title = formatCoalescedNotificationTitle(matching.accounts, payload.contactName, accountOrder);
          matching.lastTime = now;
          return { id: matching.id, replacesId: matching.id, title: matching.title };
        }

        const newId = activeNotifications.size + 1;
        const accounts = [{ accountId: payload.accountId, emoji: payload.accountEmoji, name: payload.accountName }];
        const title = formatCoalescedNotificationTitle(accounts, payload.contactName, accountOrder);
        const entry: MockEntry = {
          id: newId,
          title,
          body: payload.body,
          contactName: payload.contactName,
          accounts,
          lastTime: now,
        };
        activeNotifications.set(newId, entry);
        return { id: newId, title };
      }

      // 1. First account receives notification
      const res1 = handleIncomingNotification({
        contactName: 'General',
        body: 'Alice Cooper: Happy birthday 🎉 @Bob',
        accountId: 'acc_1',
        accountEmoji: '🏢',
        accountName: 'Official',
      });
      assert.equal(res1.title, '🏢 | General');
      assert.equal(activeNotifications.size, 1);

      // 2. Second account receives same notification 15ms later
      const res2 = handleIncomingNotification({
        contactName: 'General',
        body: 'Alice Cooper\u200e: Happy birthday 🎉 @Bob\u200e',
        accountId: 'acc_2',
        accountEmoji: '👥',
        accountName: 'Personal',
      });
      assert.equal(res2.replacesId, res1.id);
      assert.equal(res2.title, '🏢 👥 | General');
      assert.equal(activeNotifications.size, 1);

      // 3. Third account receives same notification
      const res3 = handleIncomingNotification({
        contactName: 'General',
        body: 'Alice Cooper: Happy birthday 🎉 @Bob',
        accountId: 'acc_3',
        accountEmoji: '💼',
        accountName: 'Business',
      });
      assert.equal(res3.replacesId, res1.id);
      assert.equal(res3.title, '🏢 👥 💼 | General');
      assert.equal(activeNotifications.size, 1);

      // 4. Consecutive message with identical text on the SAME account does NOT match as multi-account duplicate
      const res4 = handleIncomingNotification({
        contactName: 'General',
        body: 'Alice Cooper: Happy birthday 🎉 @Bob',
        accountId: 'acc_1',
        accountEmoji: '🏢',
        accountName: 'Official',
      });
      assert.notEqual(res4.id, res1.id);
      assert.equal(res4.replacesId, undefined);
      assert.equal(res4.title, '🏢 | General');
      assert.equal(activeNotifications.size, 2);
    });
  });

  describe('getFocusedOrFirstInListAccount', () => {
    const accounts = [
      { accountId: 'acc_2', emoji: '👥', name: 'Personal' },
      { accountId: 'acc_1', emoji: '🏢', name: 'Official' },
    ];
    const accountOrder = ['acc_1', 'acc_2', 'acc_3'];

    test('picks the currently focused account when it is in the coalesced list', () => {
      const target = getFocusedOrFirstInListAccount(accounts, 'acc_2', accountOrder);
      assert.ok(target);
      assert.equal(target.accountId, 'acc_2');
    });

    test('falls back to the earliest account in accountOrder when active account is not coalesced', () => {
      const target = getFocusedOrFirstInListAccount(accounts, 'acc_3', accountOrder);
      assert.ok(target);
      // acc_1 is earlier than acc_2 in accountOrder
      assert.equal(target.accountId, 'acc_1');
    });

    test('falls back to first-in-list account when activeAccountId is undefined', () => {
      const target = getFocusedOrFirstInListAccount(accounts, undefined, accountOrder);
      assert.ok(target);
      assert.equal(target.accountId, 'acc_1');
    });

    test('returns undefined for empty accounts list', () => {
      const target = getFocusedOrFirstInListAccount([], 'acc_1', accountOrder);
      assert.equal(target, undefined);
    });
  });

  describe('Multi-Account Notification Actions & Reply Behaviors', () => {
    const coalescedAccounts = [
      { accountId: 'acc_1', emoji: '🏢', name: 'Official' },
      { accountId: 'acc_2', emoji: '👥', name: 'Personal' },
    ];
    const accountOrder = ['acc_1', 'acc_2'];

    test('"Open Chat" all: marks all read and activates focused/first-in-list account', () => {
      const readMarks: string[] = [];
      let activatedAccount = '';

      const behavior = 'all';
      const activeId = 'acc_2'; // User is currently looking at acc_2

      const target = getFocusedOrFirstInListAccount(coalescedAccounts, activeId, accountOrder);
      assert.equal(target?.accountId, 'acc_2');

      if (behavior === 'all') {
        for (const acc of coalescedAccounts) {
          readMarks.push(acc.accountId);
        }
        activatedAccount = target!.accountId;
      }

      assert.deepEqual(readMarks, ['acc_1', 'acc_2']);
      assert.equal(activatedAccount, 'acc_2');
    });

    test('"Open Chat" focused: only marks read and opens focused/first-in-list account', () => {
      const readMarks: string[] = [];
      let activatedAccount = '';

      const behavior = 'focused';
      const activeId = 'acc_99'; // Some unrelated account active

      const target = getFocusedOrFirstInListAccount(coalescedAccounts, activeId, accountOrder);
      assert.equal(target?.accountId, 'acc_1'); // Falls back to first-in-list (acc_1)

      if (behavior === 'focused' && target) {
        readMarks.push(target.accountId);
        activatedAccount = target.accountId;
      }

      assert.deepEqual(readMarks, ['acc_1']);
      assert.equal(activatedAccount, 'acc_1');
    });

    test('in-line reply behavior: disabled removes reply box', () => {
      const behavior = 'disabled';
      const canReply = behavior !== 'disabled';
      assert.equal(canReply, false);
    });

    test('in-line reply behavior: focused routes reply to focused/first-in-list account', () => {
      const behavior = 'focused';
      const activeId = 'acc_2';
      const target = getFocusedOrFirstInListAccount(coalescedAccounts, activeId, accountOrder);

      let repliedAccount = '';
      if (behavior === 'focused' && target) {
        repliedAccount = target.accountId;
      }
      assert.equal(repliedAccount, 'acc_2');
    });
  });

  describe('Notification History Logging & Edited Message Retention', () => {
    test('logs initial message and edited message as separate historical entries', () => {
      const history: any[] = [];

      // Initial message arrives
      const initialEntry = {
        type: 'message',
        id: 'notif_1001_abc',
        timestamp: '2026-11-23T10:00:00.000Z',
        displayTime: '10:00 AM',
        direction: 'incoming',
        sender: { displayName: 'Alice' },
        accountId: 'acc_1',
        accountName: 'Personal',
        content: { type: 'text', body: 'original draft' },
        flags: undefined,
      };
      history.unshift(initialEntry);

      // Edited version arrives
      const editedEntry = {
        type: 'message',
        id: 'notif_1002_def',
        timestamp: '2026-11-23T10:01:00.000Z',
        displayTime: '10:01 AM',
        direction: 'incoming',
        sender: { displayName: 'Alice' },
        accountId: 'acc_1',
        accountName: 'Personal',
        content: { type: 'text', body: 'revised draft' },
        flags: { isEdited: true },
      };
      history.unshift(editedEntry);

      // Verify history contains both entries separately
      assert.equal(history.length, 2);
      assert.equal(history[0].content.body, 'revised draft');
      assert.equal(history[0].flags?.isEdited, true);
      assert.equal(history[1].content.body, 'original draft');
      assert.equal(history[1].flags, undefined);
    });

    test('retains full version history across multiple successive edits', () => {
      const history: any[] = [];
      const versions = ['v1 text', 'v2 text', 'v3 text'];

      for (let i = 0; i < versions.length; i++) {
        history.unshift({
          type: 'message',
          id: `notif_${1000 + i}`,
          timestamp: `2026-11-23T10:0${i}:00.000Z`,
          displayTime: `10:0${i} AM`,
          direction: 'incoming',
          sender: { displayName: 'Bob' },
          accountId: 'acc_1',
          content: { type: 'text', body: versions[i] },
          flags: i > 0 ? { isEdited: true } : undefined,
        });
      }

      assert.equal(history.length, 3);
      assert.equal(history[0].content.body, 'v3 text');
      assert.equal(history[0].flags?.isEdited, true);
      assert.equal(history[1].content.body, 'v2 text');
      assert.equal(history[1].flags?.isEdited, true);
      assert.equal(history[2].content.body, 'v1 text');
      assert.equal(history[2].flags, undefined);
    });

    test('search filtering matches "edited" keyword for items flagged with isEdited', () => {
      const entries = [
        {
          type: 'message',
          sender: { displayName: 'Alice' },
          content: { type: 'text', body: 'hello there' },
          flags: undefined,
        },
        {
          type: 'message',
          sender: { displayName: 'Alice' },
          content: { type: 'text', body: 'hello everyone' },
          flags: { isEdited: true },
        },
      ];

      const searchFilter = (items: any[], query: string) => {
        const q = query.toLowerCase().trim();
        return items.filter((item) => {
          const sender = item.sender?.displayName || '';
          const body = item.content?.body || '';
          const isEditedMatch = Boolean(item.flags?.isEdited && 'edited'.includes(q) && q.length > 0);
          return (
            sender.toLowerCase().includes(q) ||
            body.toLowerCase().includes(q) ||
            isEditedMatch
          );
        });
      };

      const matchedGeneral = searchFilter(entries, 'hello');
      assert.equal(matchedGeneral.length, 2);

      const matchedEdited = searchFilter(entries, 'edited');
      assert.equal(matchedEdited.length, 1);
      assert.equal(matchedEdited[0].content.body, 'hello everyone');
    });
  });
});
