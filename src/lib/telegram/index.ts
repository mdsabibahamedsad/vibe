export {
  isTelegramWebApp,
  initTelegramWebApp,
  getInitData,
  setHeaderColor,
  setBackgroundColor,
  expand,
  close,
  sendData,
} from "./client";

export type {
  TelegramUser,
  TelegramChat,
  TelegramInitDataUnsafe,
  TelegramInitData,
  TelegramThemeParams,
  TelegramPlatform,
  TelegramColorScheme,
  TelegramWebAppState,
} from "@/types/telegram";
