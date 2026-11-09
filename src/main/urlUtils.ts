import net from 'node:net';
import dns from 'node:dns/promises';

export const WHATSAPP_DOMAIN_REGEX = /^(?:[a-zA-Z0-9-]+\.)*(?:whatsapp\.com|whatsapp\.net|wa\.me)$/i;

/**
 * Checks if a numeric IPv4 address is within private, loopback, link-local, or reserved ranges.
 */
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return true;
  const nums = parts.map((p) => Number(p));
  for (const n of nums) {
    if (isNaN(n) || n < 0 || n > 255) return true;
  }
  const [a, b, c] = nums;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;
  // 10.0.0.0/8 (Private)
  if (a === 10) return true;
  // 100.64.0.0/10 (Shared address space / CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (Link-local / APIPA / Cloud Metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (Private)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 (IETF protocol assignments)
  if (a === 192 && b === 0 && c === 0) return true;
  // 192.0.2.0/24 (Documentation TEST-NET-1)
  if (a === 192 && b === 0 && c === 2) return true;
  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 (Network benchmark tests)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 198.51.100.0/24 (Documentation TEST-NET-2)
  if (a === 198 && b === 51 && c === 100) return true;
  // 203.0.113.0/24 (Documentation TEST-NET-3)
  if (a === 203 && b === 0 && c === 113) return true;
  // 224.0.0.0/4 (Multicast) + 240.0.0.0/4 (Reserved) + 255.255.255.255 (Broadcast)
  if (a >= 224) return true;

  return false;
}

/**
 * Checks if an IPv6 address is within private, loopback, link-local, or documentation ranges.
 */
function isPrivateIpv6(ip: string): boolean {
  const clean = ip.toLowerCase().trim();

  // IPv4-mapped IPv6 (e.g. ::ffff:192.168.1.1 or ::ffff:127.0.0.1)
  if (clean.includes('::ffff:')) {
    const ipv4Part = clean.split('::ffff:')[1];
    if (ipv4Part && net.isIPv4(ipv4Part)) {
      return isPrivateIpv4(ipv4Part);
    }
  }

  // Loopback / Unspecified
  if (clean === '::1' || clean === '::' || /^0*(:0*)*:0*1$/.test(clean) || /^0*(:0*)*$/.test(clean)) {
    return true;
  }

  // Unique Local Address (ULA - fc00::/7 -> fc.. or fd..)
  if (clean.startsWith('fc') || clean.startsWith('fd')) {
    return true;
  }

  // Link-Local (fe80::/10 -> fe8, fe9, fea, feb)
  if (/^fe[89ab]/i.test(clean)) {
    return true;
  }

  // Multicast (ff00::/8)
  if (clean.startsWith('ff')) {
    return true;
  }

  // Discard / Documentation (100::/64, 2001:db8::/32)
  if (clean.startsWith('100::') || clean.startsWith('2001:db8') || clean.startsWith('2001:0db8')) {
    return true;
  }

  return false;
}

/**
 * Determines whether an IP address (v4 or v6) belongs to a private/internal or reserved subnet.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) {
    return isPrivateIpv4(ip);
  }
  if (family === 6) {
    return isPrivateIpv6(ip);
  }
  return true; // Unknown/malformed IP is treated as unsafe
}

/**
 * Checks if a hostname directly points to a local or internal target (without DNS resolution).
 */
export function isBlockedHostname(rawHost: string): boolean {
  if (!rawHost) return true;
  let host = rawHost.trim().toLowerCase();

  // Strip brackets for IPv6 literals (e.g. [::1])
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }

  // Check direct IP address
  if (net.isIP(host)) {
    return isPrivateOrReservedIp(host);
  }

  // Known loopback and local domain suffixes
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === 'local' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    host.endsWith('.home.arpa') ||
    host.endsWith('.invalid')
  ) {
    return true;
  }

  return false;
}

/**
 * Resolves all IP addresses for a hostname and verifies none fall within private/reserved ranges.
 * Times out after 2.5s if DNS is unresponsive.
 */
export async function resolveAndValidateHost(rawHost: string, timeoutMs = 2500): Promise<boolean> {
  if (isBlockedHostname(rawHost)) {
    return false;
  }

  let host = rawHost.trim().toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }

  // If already verified safe IP literal
  if (net.isIP(host)) {
    return !isPrivateOrReservedIp(host);
  }

  try {
    const lookupPromise = dns.lookup(host, { all: true });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DNS lookup timeout')), timeoutMs)
    );

    const addresses = await Promise.race([lookupPromise, timeoutPromise]);
    if (!addresses || addresses.length === 0) {
      return false;
    }

    for (const record of addresses) {
      if (isPrivateOrReservedIp(record.address)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Validates that a URL string has a valid http/https scheme and is safe against basic SSRF.
 */
export function isSafeHttpUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    return !isBlockedHostname(parsed.hostname);
  } catch {
    return false;
  }
}

export function getTargetUrlIfLinkShim(urlStr: string): string | null {
  try {
    const parsed = new URL(urlStr);
    if (parsed.hostname === 'l.whatsapp.com' || parsed.pathname.includes('/redirect')) {
      const target = parsed.searchParams.get('u') || parsed.searchParams.get('url');
      if (target) {
        return target;
      }
    }
  } catch {
    // Ignore invalid URLs
  }
  return null;
}

export function getDomainFromUrl(urlStr: string): string {
  try {
    const hostname = new URL(urlStr).hostname;
    return hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return urlStr.toLowerCase();
  }
}

export function isDomainTrusted(targetDomain: string, trustedDomainsList: string[]): boolean {
  if (!targetDomain || !Array.isArray(trustedDomainsList) || trustedDomainsList.length === 0) {
    return false;
  }
  const cleanTarget = targetDomain.trim().toLowerCase().replace(/^www\./i, '');
  return trustedDomainsList.some((td) => {
    if (!td) return false;
    const cleanTrusted = td.trim().toLowerCase().replace(/^www\./i, '');
    if (!cleanTrusted) return false;
    return cleanTarget === cleanTrusted || cleanTarget.endsWith('.' + cleanTrusted);
  });
}

export function isWhatsAppUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname;
    if (hostname === 'l.whatsapp.com' || parsed.pathname.includes('/redirect')) {
      return false;
    }
    return WHATSAPP_DOMAIN_REGEX.test(hostname);
  } catch {
    return false;
  }
}

