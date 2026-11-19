import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractMetaContent,
  extractLinkHref,
  extractTitle,
  escapeRegex,
} from '../src/shared/htmlMetadata.ts';

describe('HTML Metadata Parsing & Entity Decoding', () => {
  test('correctly extracts meta descriptions containing single quotes / apostrophes without truncation', () => {
    const html = `
      <html>
        <head>
          <meta name="description" content="We're here to get you informed on everything you need to know about CurseForge, including helpful guides and troubleshooting articles to back you up when you get in a pickle">
          <meta property="og:description" content="We're here to get you informed on everything you need to know about CurseForge, including helpful guides and troubleshooting articles to back you up when you get in a pickle">
          <meta name="twitter:description" content="We're here to get you informed on everything you need to know about CurseForge, including helpful guides and troubleshooting articles to back you up when you get in a pickle">
        </head>
      </html>
    `;
    const expected = "We're here to get you informed on everything you need to know about CurseForge, including helpful guides and troubleshooting articles to back you up when you get in a pickle";
    assert.equal(extractMetaContent(html, 'og:description'), expected);
    assert.equal(extractMetaContent(html, 'description', true), expected);
    assert.equal(extractMetaContent(html, 'twitter:description', true), expected);
  });

  test('handles double quotes inside single-quoted content and vice versa', () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content='He said "Welcome to WAllie" and smiled'>
          <meta property="og:description" content="It's a wonderful day for Linux!">
        </head>
      </html>
    `;
    assert.equal(extractMetaContent(html, 'og:title'), 'He said "Welcome to WAllie" and smiled');
    assert.equal(extractMetaContent(html, 'og:description'), "It's a wonderful day for Linux!");
  });

  test('extracts meta attributes when content appears before property or name', () => {
    const html = `
      <html>
        <head>
          <meta content="Reversed attribute order: it's working properly" property="og:description">
          <meta content="Reversed name order: don't worry" name="description">
        </head>
      </html>
    `;
    assert.equal(extractMetaContent(html, 'og:description'), "Reversed attribute order: it's working properly");
    assert.equal(extractMetaContent(html, 'description', true), "Reversed name order: don't worry");
  });

  test('decodes numeric and named HTML entities in meta content', () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Tom &amp; Jerry&#39;s &quot;Adventures&quot; &lt;Classic&gt;">
        </head>
      </html>
    `;
    assert.equal(extractMetaContent(html, 'og:title'), 'Tom & Jerry\'s "Adventures" <Classic>');
  });

  test('extractTitle extracts and decodes document title', () => {
    const html = `
      <html>
        <head>
          <title>Exporting Modpacks: CurseForge support</title>
        </head>
      </html>
    `;
    assert.equal(extractTitle(html), 'Exporting Modpacks: CurseForge support');
  });

  test('prefers specific document title when og:title is merely identical to site_name', () => {
    const html = `
      <html>
        <head>
          <title>Exporting Modpacks: CurseForge support</title>
          <meta property="og:site_name" content="CurseForge Support">
          <meta property="og:title" content="CurseForge Support">
        </head>
      </html>
    `;
    const ogTitle = extractMetaContent(html, 'og:title');
    const docTitle = extractTitle(html);
    const siteName = extractMetaContent(html, 'og:site_name');

    let title = ogTitle || docTitle;
    if (
      siteName &&
      title &&
      docTitle &&
      title.toLowerCase() === siteName.toLowerCase() &&
      docTitle.toLowerCase() !== siteName.toLowerCase()
    ) {
      title = docTitle;
    }

    if (title && siteName) {
      const escapedSite = escapeRegex(siteName);
      const cleaned = title.replace(new RegExp(`\\s*[\\|\\-\\•\\:]\\s*${escapedSite}$`, 'i'), '').trim();
      if (cleaned) {
        title = cleaned;
      }
    }

    assert.equal(title, 'Exporting Modpacks');
  });
});

describe('Link Preview Discovery & Icon Meta Discrimination', () => {

  function discoverImageSources(html: string) {
    const ogImage =
      extractMetaContent(html, 'og:image:secure_url') ||
      extractMetaContent(html, 'og:image') ||
      extractMetaContent(html, 'twitter:image', true) ||
      extractMetaContent(html, 'twitter:image:src', true) ||
      extractLinkHref(html, 'image_src');

    const iconImage =
      extractLinkHref(html, 'apple-touch-icon') ||
      extractMetaContent(html, 'thumbnail', true) ||
      extractLinkHref(html, 'icon') ||
      extractLinkHref(html, 'shortcut icon');

    const imageUrl = ogImage || iconImage;
    const isIconMeta = !ogImage && Boolean(iconImage);

    return { ogImage, iconImage, imageUrl, isIconMeta };
  }

  function evaluateThumbnailClassification(
    isIconMeta: boolean,
    width: number,
    height: number
  ) {
    const isSmallIcon = isIconMeta || width < 200 || height < 150;
    return {
      isSmallIcon,
      shouldIncludeHQ: !isSmallIcon,
      shouldIncludeDimensions: !isSmallIcon,
    };
  }

  test('correctly identifies full-size og:image and classifies as HQ media banner', () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="GitHub - ilamparithi-in/WAllie" />
          <meta property="og:image" content="https://opengraph.githubassets.com/123/banner.png" />
          <link rel="icon" href="/favicon.ico" />
        </head>
      </html>
    `;
    const discovery = discoverImageSources(html);
    assert.equal(discovery.imageUrl, 'https://opengraph.githubassets.com/123/banner.png');
    assert.equal(discovery.isIconMeta, false);

    const classification = evaluateThumbnailClassification(discovery.isIconMeta, 1200, 600);
    assert.equal(classification.isSmallIcon, false);
    assert.equal(classification.shouldIncludeHQ, true);
    assert.equal(classification.shouldIncludeDimensions, true);
  });

  test('correctly identifies small icon meta when only favicon or apple-touch-icon is present', () => {
    const html = `
      <html>
        <head>
          <title>Google Drive</title>
          <link rel="icon" href="//ssl.gstatic.com/docs/doclist/images/drive_2022q3_32dp.png" />
          <link rel="apple-touch-icon" href="/drive-touch-icon.png" />
        </head>
      </html>
    `;
    const discovery = discoverImageSources(html);
    assert.equal(discovery.isIconMeta, true);

    const classification = evaluateThumbnailClassification(discovery.isIconMeta, 32, 32);
    assert.equal(classification.isSmallIcon, true);
    assert.equal(classification.shouldIncludeHQ, false);
    assert.equal(classification.shouldIncludeDimensions, false);
  });

  test('treats undersized og:image as small icon rather than stretching it into full size media', () => {
    const html = `
      <html>
        <head>
          <meta property="og:image" content="https://example.com/tiny-logo.png" />
        </head>
      </html>
    `;
    const discovery = discoverImageSources(html);
    assert.equal(discovery.isIconMeta, false);

    // Image is only 48x48
    const classification = evaluateThumbnailClassification(discovery.isIconMeta, 48, 48);
    assert.equal(classification.isSmallIcon, true);
    assert.equal(classification.shouldIncludeHQ, false);
    assert.equal(classification.shouldIncludeDimensions, false);
  });
});

describe('Link Preview LRU Cache Mechanics', () => {
  test('LRU cache evicts oldest entry when reaching CACHE_MAX_SIZE', () => {
    const cache = new Map<string, { data: any; timestamp: number }>();
    const maxSize = 3;

    const setCache = (key: string, data: any) => {
      if (cache.size >= maxSize) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey) cache.delete(oldestKey);
      }
      cache.set(key, { data, timestamp: Date.now() });
    };

    setCache('url1', { title: 'First' });
    setCache('url2', { title: 'Second' });
    setCache('url3', { title: 'Third' });
    assert.equal(cache.size, 3);
    assert.ok(cache.has('url1'));

    setCache('url4', { title: 'Fourth' });
    assert.equal(cache.size, 3);
    assert.equal(cache.has('url1'), false);
    assert.ok(cache.has('url2'));
    assert.ok(cache.has('url4'));
  });

  test('clearing cache resets map size to 0', () => {
    const cache = new Map<string, { data: any; timestamp: number }>();
    cache.set('url1', { data: {}, timestamp: Date.now() });
    cache.set('url2', { data: {}, timestamp: Date.now() });

    assert.equal(cache.size, 2);
    const cleared = cache.size;
    cache.clear();
    assert.equal(cleared, 2);
    assert.equal(cache.size, 0);
  });
});
