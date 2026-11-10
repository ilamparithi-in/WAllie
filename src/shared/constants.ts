export const WHATSAPP_DOMAIN_REGEX = /^([^.\s]+\.)*whatsapp\.(com|net)$/i;

export const TITLEBAR_HEIGHT = 28;

export const VISUAL_ZOOM_MIN = 1;
export const VISUAL_ZOOM_MAX = 20;

export function getAccountDisplayName(account: { name: string; emoji?: string }): string {
  return account.emoji ? `${account.emoji} ${account.name}` : account.name;
}
