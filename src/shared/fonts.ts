/**
 * Resolves the optimal Google Fonts URL for a font family.
 *
 * For variable fonts (e.g. Space Grotesk, Inter, Outfit, Roboto Flex),
 * this requests the continuous variable range (e.g. wght@100..900 or wght@300..700),
 * allowing arbitrary and fractional weights like WhatsApp Web's custom 545 weight
 * to render with true continuous variable font interpolation.
 *
 * For static fonts (e.g. Poppins, Lato), Google Fonts rejects the range syntax ('..'),
 * so this falls back to requesting all discrete weights (:wght@300;400;500;600;700)
 * so that intermediate weights snap cleanly (e.g. 545 -> 600) instead of dropping to 400.
 */

const googleFontUrlCache = new Map<string, string>();

export interface GoogleFontResolution {
  url: string;
  isVariable: boolean;
}

export async function resolveGoogleFont(family: string, cachedUrl?: string): Promise<GoogleFontResolution | null> {
  const clean = family.trim().replace(/^['"]+|['"]+$/g, '');
  if (!clean) return null;
  if (cachedUrl && cachedUrl.includes('fonts.googleapis.com') && !cachedUrl.includes('%2B')) {
    const isVariable = cachedUrl.includes('..');
    return { url: cachedUrl, isVariable };
  }

  // If in renderer process, delegate to main process via IPC to avoid network restrictions or CSP
  if (typeof window !== 'undefined' && (window as any).electronAPI?.resolveGoogleFont) {
    try {
      const res = await (window as any).electronAPI.resolveGoogleFont(clean, cachedUrl);
      if (res?.url) {
        googleFontUrlCache.set(clean.toLowerCase(), res.url);
      }
      return res;
    } catch {
      // Fallback to direct fetch
    }
  }

  const gParam = encodeURIComponent(clean).replace(/%20/g, '+');

  // Common continuous variable weight ranges in Google Fonts catalog
  const variableCandidates: string[] = [
    `https://fonts.googleapis.com/css2?family=${gParam}:wght@100..900&display=swap`,
    `https://fonts.googleapis.com/css2?family=${gParam}:wght@300..700&display=swap`,
    `https://fonts.googleapis.com/css2?family=${gParam}:wght@200..800&display=swap`,
    `https://fonts.googleapis.com/css2?family=${gParam}:wght@100..1000&display=swap`,
    `https://fonts.googleapis.com/css2?family=${gParam}:wght@300..900&display=swap`,
  ];

  for (const url of variableCandidates) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) {
        googleFontUrlCache.set(clean.toLowerCase(), url);
        return { url, isVariable: true };
      }
    } catch {}
  }

  const discreteCandidates: string[] = [
    `https://fonts.googleapis.com/css2?family=${gParam}:wght@300;400;500;600;700&display=swap`,
    `https://fonts.googleapis.com/css2?family=${gParam}:wght@400;500;600;700&display=swap`,
    `https://fonts.googleapis.com/css2?family=${gParam}:wght@400;700&display=swap`,
    `https://fonts.googleapis.com/css2?family=${gParam}&display=swap`
  ];

  for (const url of discreteCandidates) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) {
        googleFontUrlCache.set(clean.toLowerCase(), url);
        return { url, isVariable: false };
      }
    } catch {}
  }

  return null;
}

export async function resolveGoogleFontUrl(family: string, cachedUrl?: string): Promise<string> {
  const clean = family.trim().replace(/^['"]+|['"]+$/g, '');
  if (!clean) return '';
  if (cachedUrl && cachedUrl.includes('fonts.googleapis.com') && !cachedUrl.includes('%2B')) {
    return cachedUrl;
  }
  if (googleFontUrlCache.has(clean.toLowerCase())) {
    const cached = googleFontUrlCache.get(clean.toLowerCase())!;
    if (!cached.includes('%2B')) {
      return cached;
    }
  }

  const res = await resolveGoogleFont(family, cachedUrl);
  if (res) return res.url;

  const gParam = encodeURIComponent(clean).replace(/%20/g, '+');
  const fallback = `https://fonts.googleapis.com/css2?family=${gParam}&display=swap`;
  googleFontUrlCache.set(clean.toLowerCase(), fallback);
  return fallback;
}
