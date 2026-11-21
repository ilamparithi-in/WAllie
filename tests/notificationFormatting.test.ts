import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeHtmlEntities,
  stripHtmlTags,
  formatNotificationSummary,
  formatNotificationBody,
  parseMediaLine,
  formatMediaLine,
  coalesceNotificationMessages,
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
  });
});
