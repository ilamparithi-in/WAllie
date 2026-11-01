import { nativeImage } from 'electron';
import { state } from './state';
import type { LinkPreviewData } from '../shared/types';

const PREVIEW_CACHE = new Map<string, { data: LinkPreviewData; timestamp: number; ttl: number }>();
const CACHE_MAX_SIZE = 200;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Discordbot User-Agent is the industry standard for OpenGraph link embeds (universally whitelisted by Reddit, Twitter, Cloudflare, etc.)
const CRAWLER_USER_AGENT = 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)';
const FALLBACK_CRAWLER_USER_AGENT = 'WhatsApp/2.24.6.77 A';
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

function isPrivateIpOrHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.local') || lower === '0.0.0.0') return true;
  if (/^127\.\d+\.\d+\.\d+$/.test(lower)) return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(lower)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(lower)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(lower)) return true;
  if (lower === '::1' || lower === 'fe80::') return true;
  return false;
}

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

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m && m[1] ? decodeHtmlEntities(m[1].trim()) : null;
}

/**
 * Universal safe multi-hop redirect follower.
 * Prevents hanging or crashing on infinite redirect loops (e.g. Google abuse /sorry/ walls).
 */
async function fetchPageHtmlSafe(
  initialUrl: string,
  userAgent: string,
  maxHops = 5
): Promise<{ finalUrl: string; html: string } | null> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop < maxHops; hop++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    try {
      const res = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      clearTimeout(timeout);

      // Handle redirect
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) break;

        const nextUrl = new URL(location, currentUrl).toString();
        // Abort if redirecting to known bot CAPTCHA / abuse wall
        if (nextUrl.includes('/sorry/') || nextUrl.includes('captcha')) {
          break;
        }
        currentUrl = nextUrl;
        continue;
      }

      if (!res.ok) return null;

      const textBuffer = await res.arrayBuffer();
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const html = decoder.decode(textBuffer.slice(0, 1024 * 1024));
      return { finalUrl: currentUrl, html };
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  return null;
}

async function fetchAndProcessThumbnail(
  imageUrl: string,
  finalUrl: string
): Promise<{ thumbnailBase64: string; width: number; height: number } | null> {
  let imgTimeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const absoluteImageUrl = new URL(imageUrl, finalUrl).toString();
    const imgController = new AbortController();
    imgTimeout = setTimeout(() => imgController.abort(), 3500);

    const imgRes = await fetch(absoluteImageUrl, {
      signal: imgController.signal,
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });

    if (!imgRes.ok) return null;

    const imgBuf = await imgRes.arrayBuffer();
    if (imgBuf.byteLength === 0 || imgBuf.byteLength > 10 * 1024 * 1024) {
      return null;
    }

    const img = nativeImage.createFromBuffer(Buffer.from(imgBuf));
    if (img.isEmpty()) return null;

    const origSize = img.getSize();
    let target = img;
    const maxDim = 320;
    if (origSize.width > maxDim || origSize.height > maxDim) {
      const ratio = Math.min(maxDim / origSize.width, maxDim / origSize.height);
      target = img.resize({
        width: Math.max(1, Math.round(origSize.width * ratio)),
        height: Math.max(1, Math.round(origSize.height * ratio)),
        quality: 'better',
      });
    }
    let jpegBuf = target.toJPEG(75);
    // Keep inline thumbnail within WhatsApp 32KB budget
    if (jpegBuf.byteLength > 30 * 1024) {
      jpegBuf = target.toJPEG(50);
    }
    if (jpegBuf.byteLength > 0) {
      const finalSize = target.getSize();
      return {
        thumbnailBase64: jpegBuf.toString('base64'),
        width: finalSize.width,
        height: finalSize.height,
      };
    }
    return null;
  } catch {
    return null;
  } finally {
    if (imgTimeout) clearTimeout(imgTimeout);
  }
}

export async function fetchLinkPreview(urlStr: string): Promise<LinkPreviewData | null> {
  // Check if feature is enabled in global settings
  if (state.globalSettings?.standaloneLinkPreviewEnabled === false) {
    return null;
  }

  try {
    const parsedUrl = new URL(urlStr);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return null;
    }

    if (isPrivateIpOrHost(parsedUrl.hostname)) {
      return null;
    }

    // Pass through native WhatsApp internal invite or catalog links
    const host = parsedUrl.hostname.toLowerCase();
    if (host === 'chat.whatsapp.com' || host === 'wa.me' || host === 'api.whatsapp.com') {
      return null;
    }

    // Check cache
    const cached = PREVIEW_CACHE.get(urlStr);
    if (cached && Date.now() - cached.timestamp < (cached.ttl || CACHE_TTL_MS)) {
      return cached.data;
    }

    // Fetch page: cascade through standard crawler UA -> fallback crawler UA -> browser UA
    let pageData = await fetchPageHtmlSafe(urlStr, CRAWLER_USER_AGENT);
    if (!pageData) {
      pageData = await fetchPageHtmlSafe(urlStr, FALLBACK_CRAWLER_USER_AGENT);
    }
    if (!pageData) {
      pageData = await fetchPageHtmlSafe(urlStr, BROWSER_USER_AGENT);
    }

    if (!pageData || !pageData.html) {
      return null;
    }

    const { finalUrl, html } = pageData;

    // --- Universal Title Extraction ---
    let title =
      extractMetaContent(html, 'og:title') ||
      extractMetaContent(html, 'twitter:title', true) ||
      extractTitle(html);

    // Dynamic brand cleaning using the site's own og:site_name (no hardcoded domain names)
    const siteName =
      extractMetaContent(html, 'og:site_name') ||
      extractMetaContent(html, 'application-name', true);

    if (title && siteName) {
      const escapedSite = escapeRegex(siteName);
      // Clean prefix e.g. "From the ... on <SiteName>: Real Title"
      title = title.replace(new RegExp(`^From the\\s+.*?\\s+on\\s+${escapedSite}:\\s*`, 'i'), '').trim();
      // Clean suffix e.g. "Real Title - <SiteName>" or "Real Title | <SiteName>"
      title = title.replace(new RegExp(`\\s*[\\|\\-\\•\\:]\\s*${escapedSite}$`, 'i'), '').trim();
    }

    // --- Universal Description Extraction ---
    const ogDesc = extractMetaContent(html, 'og:description');
    const twDesc = extractMetaContent(html, 'twitter:description', true);
    const metaDesc = extractMetaContent(html, 'description', true);

    let description = ogDesc || twDesc || metaDesc;

    // If og:description is boilerplate while standard description contains richer post text, prefer standard description
    if (metaDesc && ogDesc && metaDesc.length > ogDesc.length && !metaDesc.toLowerCase().startsWith('explore this post')) {
      description = metaDesc;
    }

    if (description) {
      // Clean forum/social stats prefix (e.g. "24 votes, 10 comments. Actual body text...")
      description = description.replace(/^\d+\s+votes?,\s+\d+\s+comments?\.\s*/i, '').trim();
    }

    if (!title && !description) {
      return null;
    }

    title = (title || parsedUrl.hostname).replace(/\s+/g, ' ').trim();
    description = (description || urlStr).replace(/\s+/g, ' ').trim();

    // Determine preview type
    const ogType = (extractMetaContent(html, 'og:type') || '').toLowerCase();
    const isVideo =
      ogType.includes('video') ||
      host.includes('youtube.com') ||
      host === 'youtu.be' ||
      host.includes('vimeo.com') ||
      host.includes('tiktok.com');

    // --- Universal Image Discovery ---
    let imageUrl =
      extractMetaContent(html, 'og:image:secure_url') ||
      extractMetaContent(html, 'og:image') ||
      extractMetaContent(html, 'twitter:image', true) ||
      extractMetaContent(html, 'twitter:image:src', true) ||
      extractLinkHref(html, 'image_src') ||
      extractMetaContent(html, 'thumbnail', true) ||
      extractLinkHref(html, 'apple-touch-icon') ||
      extractLinkHref(html, 'icon');

    let thumbnailBase64: string | undefined;
    let thumbnailWidth: number | undefined;
    let thumbnailHeight: number | undefined;

    if (imageUrl) {
        // If media fails to download or process, retry immediately up to 3 times
        const MAX_MEDIA_RETRIES = 3;
        let thumbnailResult: { thumbnailBase64: string; width: number; height: number } | null = null;

          for (let attempt = 0; attempt <= MAX_MEDIA_RETRIES; attempt++) {
            thumbnailResult = await fetchAndProcessThumbnail(imageUrl, finalUrl);
            if (thumbnailResult) {
              break;
            }
          }

          if (thumbnailResult) {
            thumbnailBase64 = thumbnailResult.thumbnailBase64;
            thumbnailWidth = thumbnailResult.width;
            thumbnailHeight = thumbnailResult.height;
          }
        }

        const result: LinkPreviewData = {
          url: urlStr,
          title,
          description,
          thumbnailBase64,
          thumbnailWidth,
          thumbnailHeight,
          previewType: isVideo ? 'video' : 'none',
        };

          // Store in LRU cache.
          // If the page has an image specified but media failed to download even after retrying,
          // do NOT cache the picture-less result so future requests can retry fetching the media.
          if (!imageUrl || thumbnailBase64) {
            if (PREVIEW_CACHE.size >= CACHE_MAX_SIZE) {
              const oldestKey = PREVIEW_CACHE.keys().next().value;
              if (oldestKey) PREVIEW_CACHE.delete(oldestKey);
            }
            PREVIEW_CACHE.set(urlStr, { data: result, timestamp: Date.now(), ttl: CACHE_TTL_MS });
          }

          return result;
        } catch {
          return null;
        }
      }

export function clearLinkPreviewCache(): { clearedCount: number } {
        const clearedCount = PREVIEW_CACHE.size;
        PREVIEW_CACHE.clear();
        return { clearedCount };
      }

      export function getLinkPreviewCacheSize(): number {
        return PREVIEW_CACHE.size;
      }

