import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeHtmlEntities,
  stripHtmlTags,
  formatNotificationSummary,
  formatNotificationBody,
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
});
