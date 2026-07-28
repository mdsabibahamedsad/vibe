/**
 * Telegram WebApp type definitions.
 *
 * These types are based on the Telegram Mini Apps API.
 * Reference: https://core.telegram.org/bots/webapps
 *
 * IMPORTANT: Client-provided Telegram identity data must NOT be trusted
 * for authorization. All initData must be validated server-side before
 * relying on the user identity.
 */

/** Telegram WebApp user object from initDataUnsafe */
export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

/** Telegram WebApp chat information */
export interface TelegramChat {
  id: number;
  type: "group" | "supergroup" | "channel";
  title: string;
  username?: string;
  photo_url?: string;
}

/** initDataUnsafe payload from Telegram WebApp */
export interface TelegramInitDataUnsafe {
  query_id?: string;
  user?: TelegramUser;
  receiver?: TelegramUser;
  chat?: TelegramChat;
  chat_type?: string;
  chat_instance?: string;
  start_param?: string;
  auth_date?: number;
  hash?: string;
  signature?: string;
}

/** Complete Telegram WebApp init data string (raw) */
export interface TelegramInitData {
  queryString: string;
  unsafe: TelegramInitDataUnsafe;
}

/** Telegram WebApp theme parameters */
export interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
  section_header_text_color?: string;
  subtitle_text_color?: string;
  destructive_text_color?: string;
}

/** Telegram WebApp platform identifier */
export type TelegramPlatform =
  "android" | "android_x" | "ios" | "macos" | "windows" | "linux" | "web" | "unknown";

/** Telegram WebApp color scheme */
export type TelegramColorScheme = "light" | "dark";

/** Safe-to-expose Telegram WebApp state after initialization */
export interface TelegramWebAppState {
  ready: boolean;
  platform: TelegramPlatform;
  colorScheme: TelegramColorScheme;
  theme: TelegramThemeParams;
  viewportHeight: number;
  viewportStableHeight: number;
  isExpanded: boolean;
  /** The raw initData string — must be sent to the server for validation */
  initData: string;
  /** Client-provided user info — DO NOT TRUST without server-side validation */
  unsafeUser?: TelegramUser;
}
