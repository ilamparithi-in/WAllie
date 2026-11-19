import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Link Preview Discovery & Icon Meta Discrimination', () => {
  function decodeHtmlEntities(str: string): string {
    if (!str) return '';
    return str
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&#039;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#x2F;/gi, '/')
      .replace(/&#(\d+);/g, (_, dec) => {
        try {
          return String.fromCharCode(parseInt(dec, 10));
        } catch {
          return '';
        }
      });
  }

  function extractMetaContent(html: string, propertyName: string, isName = false): string | null {
    const attr = isName ? 'name' : 'property';
    const r1 = new RegExp(`<meta\\s+[^>]*?${attr}=["']${propertyName}["'][^>]*?content=["']([^"']*)["']`, 'i');
    const m1 = html.match(r1);
    if (m1 && m1[1]) return decodeHtmlEntities(m1[1].trim());

    const r2 = new RegExp(`<meta\\s+[^>]*?content=["']([^"']*)["'][^>]*?${attr}=["']${propertyName}["']`, 'i');
    const m2 = html.match(r2);
    if (m2 && m2[1]) return decodeHtmlEntities(m2[1].trim());

    return null;
  }

  function extractLinkHref(html: string, relType: string): string | null {
    const r1 = new RegExp(`<link\\s+[^>]*?rel=["'][^"']*?${relType}[^"']*?["'][^>]*?href=["']([^"']*)["']`, 'i');
    const m1 = html.match(r1);
    if (m1 && m1[1]) return decodeHtmlEntities(m1[1].trim());

    const r2 = new RegExp(`<link\\s+[^>]*?href=["']([^"']*)["'][^>]*?rel=["'][^"']*?${relType}[^"']*?["']`, 'i');
    const m2 = html.match(r2);
    if (m2 && m2[1]) return decodeHtmlEntities(m2[1].trim());

    return null;
  }

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
