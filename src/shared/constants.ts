export const WHATSAPP_DOMAIN_REGEX = /^([^.\s]+\.)*whatsapp\.(com|net)$/i;

export const TITLEBAR_HEIGHT = 28;
export const MACOS_TRAFFIC_LIGHTS_WIDTH = 78;
export const MACOS_TRAFFIC_LIGHT_POSITION = { x: 12, y: 8 } as const;

export const VISUAL_ZOOM_MIN = 1;
export const VISUAL_ZOOM_MAX = 20;

export function getAccountDisplayName(account: { name: string; emoji?: string }): string {
  return account.emoji ? `${account.emoji} ${account.name}` : account.name;
}
