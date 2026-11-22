import { z } from 'zod';

/**
 * Common primitive schemas
 */
export const accountIdSchema = z.string().trim().min(1).max(100);

export const filePathSchema = z.string().trim().min(1).max(4096).refine((val) => !val.includes('\0'), {
  message: 'File path cannot contain null bytes',
});

export const urlStringSchema = z.string().trim().min(1).max(8192).refine(
  (url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'whatsapp:' || parsed.protocol === 'wallie:';
    } catch {
      return false;
    }
  },
  { message: 'URL must have a valid protocol (http, https, whatsapp, wallie)' }
);

/**
 * Window & Zoom schemas
 */
export const zoomDirectionSchema = z.enum(['in', 'out']);

/**
 * Account schemas
 */
export const addAccountOptionsSchema = z
  .union([
    z.string().trim().max(100),
    z.object({
      name: z.string().trim().max(100).optional(),
      emoji: z.string().trim().max(32).optional(),
      preload: z.boolean().optional(),
    }),
  ])
  .optional();

export const accountRenameSchema = z.object({
  id: accountIdSchema,
  newName: z.string().trim().min(1).max(100),
});

export const accountEmojiSchema = z.object({
  id: accountIdSchema,
  emoji: z.string().max(32),
});

export const accountCssSchema = z.object({
  accountId: accountIdSchema,
  customCss: z.string().max(500000),
  selectedTheme: z.string().max(100),
});

export const accountAppearanceSchema = z.object({
  accountId: accountIdSchema,
  appearance: z.record(z.string(), z.any()),
});

export const accountSettingsSchema = z.record(z.string(), z.any());

export const storageClearTypeSchema = z.enum(['cache', 'media']);

/**
 * Settings schemas
 */
export const themeModeSchema = z.enum(['system', 'light', 'dark']);

export const multiAccountOpenChatBehaviorSchema = z.enum(['all', 'focused', 'disabled']);
export const multiAccountInlineReplyBehaviorSchema = z.enum(['disabled', 'focused']);

export const globalSettingsSchema = z.object({
  appScale: z.number().min(25).max(500).optional(),
  notificationRetentionDays: z.number().int().min(0).max(3650).optional(),
  themeMode: themeModeSchema.optional(),
  disclaimerAccepted: z.boolean().optional(),
  coalesceMultiAccountNotifications: z.boolean().optional(),
  multiAccountOpenChatBehavior: multiAccountOpenChatBehaviorSchema.optional(),
  multiAccountInlineReplyBehavior: multiAccountInlineReplyBehaviorSchema.optional(),
}).passthrough();

/**
 * Extension schemas
 */
export const extensionImportTypeSchema = z.enum(['folder', 'archive']);

export const extensionToggleSchema = z.object({
  accountId: accountIdSchema,
  extensionId: z.string().trim().min(1).max(200),
  enabled: z.boolean(),
});

export const extensionTogglePinSchema = z.object({
  accountId: accountIdSchema,
  extensionId: z.string().trim().min(1).max(200),
  pinned: z.boolean(),
});

export const extensionRemoveSchema = z.object({
  accountId: accountIdSchema,
  extensionId: z.string().trim().min(1).max(200),
});

export const extensionInstallWebstoreSchema = z.object({
  accountId: accountIdSchema,
  urlOrId: z.string().trim().min(1).max(1000),
});

/**
 * Notification & Toast schemas
 */
export const notificationCreateSchema = z.object({
  title: z.string().max(500).default(''),
  body: z.string().max(10000).default(''),
  icon: z.string().max(5000000).default(''),
  tag: z.string().max(500).default(''),
  canReply: z.boolean().optional(),
});

export const notificationLogEntrySchema = z.object({
  title: z.string().max(500).default(''),
  body: z.string().max(10000).default(''),
});

export const notificationDismissSchema = z.object({
  tag: z.string().max(500).optional(),
  contactName: z.string().max(500).optional(),
});

export const toastPayloadSchema = z.object({
  message: z.string().min(1).max(2000),
  url: z.string().max(4000).optional(),
});

/**
 * Downloads schemas
 */
export const downloadIntentSchema = z.object({
  intent: z.any(),
  filename: z.string().max(500).optional(),
  size: z.number().nonnegative().optional(),
  hash: z.string().max(100).optional(),
  autoOpen: z.boolean().optional(),
});

export const downloadFailureSchema = z.object({
  text: z.string().max(5000),
  filename: z.string().max(500).optional(),
});

export const fileCardClickSchema = z.union([
  z.string().max(500),
  z.object({
    filename: z.string().max(500),
    size: z.number().nonnegative().optional(),
    hash: z.string().max(100).optional(),
  }),
]);

/**
 * Call status schemas
 */
export const callStatusSchema = z.object({
  status: z.enum(['answered', 'declined']),
});

/**
 * Dialog schemas
 */
export const nativePromptOptionsSchema = z.object({
  title: z.string().max(200).default('Prompt'),
  message: z.string().max(2000),
  defaultValue: z.string().max(2000).optional(),
  placeholder: z.string().max(200).optional(),
  confirmLabel: z.string().max(100).optional(),
  cancelLabel: z.string().max(100).optional(),
  inputType: z.enum(['text', 'password']).optional(),
});

export const nativeConfirmOptionsSchema = z.object({
  title: z.string().max(200).default('Confirm'),
  message: z.string().max(2000),
  confirmLabel: z.string().max(100).optional(),
  cancelLabel: z.string().max(100).optional(),
  type: z.enum(['none', 'info', 'error', 'question', 'warning']).optional(),
});

/**
 * Safe validation helper
 */
export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errorDetails = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    console.warn(`[IPC Validation Warning] Payload rejected: ${errorDetails}`);
    throw new Error(`Invalid IPC arguments: ${errorDetails}`);
  }
  return result.data;
}

