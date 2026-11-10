import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isWhatsAppUrl,
  isPrivateOrReservedIp,
  isBlockedHostname,
  isSafeHttpUrl,
  getDomainFromUrl,
  isDomainTrusted,
  getTargetUrlIfLinkShim,
} from '../src/main/urlUtils.ts';

describe('URL Utilities & SSRF Protection', () => {
  describe('isWhatsAppUrl', () => {
    test('accepts official WhatsApp Web and API domains', () => {
      assert.equal(isWhatsAppUrl('https://web.whatsapp.com'), true);
      assert.equal(isWhatsAppUrl('https://api.whatsapp.com/send?phone=123'), true);
      assert.equal(isWhatsAppUrl('https://whatsapp.com'), true);
      assert.equal(isWhatsAppUrl('https://static.whatsapp.net/resource.js'), true);
      assert.equal(isWhatsAppUrl('https://wa.me/123456789'), true);
    });

    test('rejects link shim redirectors and spoofed domains', () => {
      assert.equal(isWhatsAppUrl('https://l.whatsapp.com/l.php?u=https%3A%2F%2Fevil.com'), false);
      assert.equal(isWhatsAppUrl('https://web.whatsapp.com/redirect?url=https://evil.com'), false);
      assert.equal(isWhatsAppUrl('https://web.whatsapp.com.attacker.com'), false);
      assert.equal(isWhatsAppUrl('https://fake-whatsapp.com'), false);
      assert.equal(isWhatsAppUrl('not-a-valid-url'), false);
    });
  });

  describe('isPrivateOrReservedIp', () => {
    test('identifies IPv4 private and loopback ranges', () => {
      assert.equal(isPrivateOrReservedIp('127.0.0.1'), true);
      assert.equal(isPrivateOrReservedIp('127.0.1.1'), true);
      assert.equal(isPrivateOrReservedIp('10.0.0.1'), true);
      assert.equal(isPrivateOrReservedIp('172.16.0.1'), true);
      assert.equal(isPrivateOrReservedIp('172.31.255.255'), true);
      assert.equal(isPrivateOrReservedIp('192.168.1.1'), true);
      assert.equal(isPrivateOrReservedIp('169.254.169.254'), true);
      assert.equal(isPrivateOrReservedIp('100.64.0.1'), true);
      assert.equal(isPrivateOrReservedIp('0.0.0.0'), true);
    });

    test('identifies IPv6 private and loopback ranges', () => {
      assert.equal(isPrivateOrReservedIp('::1'), true);
      assert.equal(isPrivateOrReservedIp('fe80::1'), true);
      assert.equal(isPrivateOrReservedIp('fc00::1'), true);
      assert.equal(isPrivateOrReservedIp('fd00::1'), true);
      assert.equal(isPrivateOrReservedIp('::ffff:127.0.0.1'), true);
      assert.equal(isPrivateOrReservedIp('::ffff:192.168.1.1'), true);
    });

    test('permits public unicast IP addresses', () => {
      assert.equal(isPrivateOrReservedIp('8.8.8.8'), false);
      assert.equal(isPrivateOrReservedIp('1.1.1.1'), false);
      assert.equal(isPrivateOrReservedIp('142.250.190.46'), false);
    });
  });

  describe('isBlockedHostname', () => {
    test('blocks internal, local, and metadata hostnames', () => {
      assert.equal(isBlockedHostname('localhost'), true);
      assert.equal(isBlockedHostname('sub.localhost'), true);
      assert.equal(isBlockedHostname('machine.local'), true);
      assert.equal(isBlockedHostname('service.internal'), true);
      assert.equal(isBlockedHostname('corp.company.corp'), true);
      assert.equal(isBlockedHostname('metadata.google.internal'), true);
    });

    test('allows standard public internet hostnames', () => {
      assert.equal(isBlockedHostname('github.com'), false);
      assert.equal(isBlockedHostname('web.whatsapp.com'), false);
      assert.equal(isBlockedHostname('example.org'), false);
    });
  });

  describe('isSafeHttpUrl', () => {
    test('validates safe public HTTP/HTTPS URLs', () => {
      assert.equal(isSafeHttpUrl('https://example.com/page'), true);
      assert.equal(isSafeHttpUrl('http://github.com'), true);
    });

    test('rejects private IP URLs and non-HTTP protocols', () => {
      assert.equal(isSafeHttpUrl('http://127.0.0.1:8080/secret'), false);
      assert.equal(isSafeHttpUrl('http://169.254.169.254/latest/meta-data'), false);
      assert.equal(isSafeHttpUrl('http://localhost:3000'), false);
      assert.equal(isSafeHttpUrl('file:///etc/passwd'), false);
      assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
      assert.equal(isSafeHttpUrl('data:text/html,evil'), false);
    });
  });

  describe('getTargetUrlIfLinkShim', () => {
    test('extracts destination URL from WhatsApp link shims', () => {
      const shim = 'https://l.whatsapp.com/l.php?u=https%3A%2F%2Fgithub.com%2Filamparithi-in%2FWAllie&h=AT123';
      const target = getTargetUrlIfLinkShim(shim);
      assert.equal(target, 'https://github.com/ilamparithi-in/WAllie');
    });

    test('returns null for non-shim URLs', () => {
      assert.equal(getTargetUrlIfLinkShim('https://example.com'), null);
    });
  });

  describe('Domain Trust & Extraction', () => {
    test('extracts clean hostname domain', () => {
      assert.equal(getDomainFromUrl('https://sub.domain.co.uk/path?q=1'), 'sub.domain.co.uk');
    });

    test('checks domain against trusted list with subdomain wildcards', () => {
      const trusted = ['github.com', '*.whatsapp.com'];
      assert.equal(isDomainTrusted('github.com', trusted), true);
      assert.equal(isDomainTrusted('web.whatsapp.com', trusted), true);
      assert.equal(isDomainTrusted('api.whatsapp.com', trusted), true);
      assert.equal(isDomainTrusted('attacker.com', trusted), false);
    });
  });
});

