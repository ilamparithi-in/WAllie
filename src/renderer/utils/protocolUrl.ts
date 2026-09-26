export interface ParsedProtocolUrl {
  type: 'group_invite' | 'send_message' | 'unknown';
  title: string;
  badge: string;
  code?: string;
  phone?: string;
  text?: string;
  rawUrl: string;
}

export function parseProtocolUrl(urlStr: string): ParsedProtocolUrl {
  try {
    const url = new URL(urlStr);

    // Group chat invite via custom scheme or web url
    const codeParam = url.searchParams.get('code');
    if (codeParam) {
      return {
        type: 'group_invite',
        title: 'Group Chat Invite',
        badge: 'Group Invite',
        code: codeParam,
        rawUrl: urlStr
      };
    }

    if (url.hostname === 'chat.whatsapp.com') {
      const code = url.pathname.replace(/^\/(invite\/)?/, '').split('/')[0];
      if (code) {
        return {
          type: 'group_invite',
          title: 'Group Chat Invite',
          badge: 'Group Invite',
          code,
          rawUrl: urlStr
        };
      }
    }

    // Direct message / send URL
    const isSendHost = url.hostname === 'send' || url.hostname === 'api.whatsapp.com' || url.hostname === 'wa.me';
    const hasSendPath = url.pathname.startsWith('/send');
    const phone = url.searchParams.get('phone') || (url.hostname === 'wa.me' ? url.pathname.replace(/^\//, '') : null);
    const text = url.searchParams.get('text');

    if (phone || text || isSendHost || hasSendPath) {
      return {
        type: 'send_message',
        title: 'Send WhatsApp Message',
        badge: 'Direct Message',
        phone: phone || undefined,
        text: text || undefined,
        rawUrl: urlStr
      };
    }

    return {
      type: 'unknown',
      title: 'WhatsApp External Link',
      badge: 'External Link',
      rawUrl: urlStr
    };
  } catch {
    return {
      type: 'unknown',
      title: 'WhatsApp External Link',
      badge: 'External Link',
      rawUrl: urlStr
    };
  }
}
