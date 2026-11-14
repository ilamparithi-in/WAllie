import type { Account, AccountSettings } from '../shared/types';

export function getDefaultAccountSettings(): AccountSettings {
  return {
    cameraEnabled: true,
    micEnabled: true,
    notificationsEnabled: true,
    geolocationEnabled: false,
    clipboardReadEnabled: false,
    customCss: '',
    selectedTheme: 'none',
    fontFamily: '',
    fontUrl: '',
    preferGoogleFont: false,
    monoFontFamily: '',
    monoFontUrl: '',
    preferGoogleMonoFont: false,
    followSystemFont: false,
    customWallpaper: '',
  };
}

export function createNewAccount(
  customName?: string,
  index = 1,
  existingAccountIds: string[] = [],
  emoji?: string
): Account {
  let newId = `acc_${Date.now()}`;
  if (existingAccountIds.includes(newId)) {
    newId = `acc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  }
  const validatedName = typeof customName === 'string' && customName.trim()
    ? customName.trim().substring(0, 100)
    : `Account ${index}`;
  return {
    id: newId,
    name: validatedName,
    partition: `persist:account_${newId}`,
    unreadCount: 0,
    loggedIn: false,
    extensions: [],
    emoji: typeof emoji === 'string' ? emoji.trim().substring(0, 32) : '',
    settings: getDefaultAccountSettings(),
  };
}
