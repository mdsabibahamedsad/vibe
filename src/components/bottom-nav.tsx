"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { ReactNode } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** Center-emphasized create action */
  emphasized?: boolean;
}

/** Light haptic tick (no-op outside Telegram). */
function hapticLight(): void {
  try {
    const tg = (
      window as unknown as {
        Telegram?: {
          WebApp?: {
            HapticFeedback?: { impactOccurred?: (style: string) => void };
          };
        };
      }
    ).Telegram;
    tg?.WebApp?.HapticFeedback?.impactOccurred?.("light");
  } catch {
    // Haptics unavailable — silently ignore
  }
}

function HomeIcon({ active }: { active: boolean }) {
  return active ? (
    <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" />
      <path d="M12 5.432l8.159 8.159c.03.03.06.058.094.086v6.098a1.5 1.5 0 01-1.5 1.5h-3.75a1.5 1.5 0 01-1.5-1.5v-3.75a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75v3.75a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-6.098a2.25 2.25 0 01.094-.086L12 5.432z" />
    </svg>
  ) : (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
    </svg>
  );
}

function CompassIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-6 w-6" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2a10 10 0 100 20 10 10 0 000-20zm4.24 5.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function ChatIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-6 w-6" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

function UserIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-6 w-6" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
      />
    </svg>
  );
}

function useNavItems(): NavItem[] {
  const pathname = usePathname();
  const { t } = useTranslation("navigation");

  return [
    {
      href: "/",
      label: t("bottomNav.home"),
      icon: <HomeIcon active={pathname === "/"} />,
    },
    {
      href: "/discover",
      label: t("bottomNav.discover"),
      icon: <CompassIcon active={pathname === "/discover" || pathname === "/dating"} />,
    },
    {
      href: "/create",
      label: t("bottomNav.create"),
      icon: <PlusIcon />,
      emphasized: true,
    },
    {
      href: "/chats",
      label: t("bottomNav.chats"),
      icon: <ChatIcon active={pathname === "/chats" || pathname.startsWith("/chat/")} />,
    },
    {
      href: "/profile",
      label: t("bottomNav.profile"),
      icon: <UserIcon active={pathname === "/profile" || pathname.startsWith("/profile/")} />,
    },
  ];
}

function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  if (item.href === "/discover") return pathname === "/discover" || pathname === "/dating";
  if (item.href === "/profile") return pathname === "/profile" || pathname.startsWith("/profile/");
  return pathname === item.href;
}

export function BottomNav() {
  const pathname = usePathname();
  const items = useNavItems();

  return (
    <nav
      className="sticky bottom-0 z-20 px-3 pb-[calc(0.5rem+var(--safe-area-bottom))] pt-2 lg:hidden"
      aria-label="Primary"
    >
      <div className="glass mx-auto flex max-w-md items-center justify-around gap-1 rounded-full px-2 py-2 shadow-lift">
        {items.map((item) => {
          const active = isActive(item, pathname);
          const isEmphasized = item.emphasized === true;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={hapticLight}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={
                isEmphasized
                  ? "group relative flex flex-1 items-center justify-center"
                  : `relative flex flex-1 flex-col items-center gap-0.5 rounded-full px-2 py-1.5 text-[10px] font-medium transition-all ${
                      active ? "text-primary" : "text-muted hover:text-fg"
                    }`
              }
            >
              {isEmphasized ? (
                <span className="flex h-11 w-11 -translate-y-2 items-center justify-center rounded-full bg-brand-gradient text-white shadow-glow transition-transform active:scale-90 group-active:scale-90">
                  {item.icon}
                </span>
              ) : (
                <span
                  className={`transition-transform active:scale-90 ${
                    active ? "scale-110" : ""
                  }`}
                >
                  {item.icon}
                </span>
              )}
              {!isEmphasized && <span>{item.label}</span>}
              {isEmphasized && <span className="sr-only">{item.label}</span>}
              {active && !isEmphasized && (
                <span className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-primary" aria-hidden />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * DesktopNav — vertical navigation rail for Telegram Web / Desktop (lg+).
 * Rendered alongside BottomNav; pages center their content so both coexist.
 */
export function DesktopNav() {
  const pathname = usePathname();
  const items = useNavItems();

  return (
    <nav
      className="fixed left-4 top-1/2 z-30 hidden -translate-y-1/2 lg:block"
      aria-label="Primary"
    >
      <div className="glass flex flex-col items-center gap-1 rounded-full px-2 py-3 shadow-lift">
        <Link
          href="/"
          aria-label="Vibe"
          className="mb-1 flex h-9 w-9 items-center justify-center rounded-full bg-brand-gradient font-display text-lg font-bold text-white shadow-glow"
        >
          V
        </Link>
        {items.map((item) => {
          const active = isActive(item, pathname);
          const isEmphasized = item.emphasized === true;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={hapticLight}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              title={item.label}
              className={
                isEmphasized
                  ? "group relative my-1 flex h-12 w-12 items-center justify-center rounded-full bg-brand-gradient text-white shadow-glow transition-transform hover:scale-105 active:scale-95"
                  : `group relative flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
                      active ? "text-primary" : "text-muted hover:text-fg hover:bg-fg/5"
                    }`
              }
            >
              {item.icon}
              {active && !isEmphasized && (
                <span
                  className="absolute left-0 h-5 w-1 rounded-full bg-primary"
                  aria-hidden
                />
              )}
              {/* Tooltip */}
              <span className="pointer-events-none absolute left-full ms-2 whitespace-nowrap rounded-lg bg-fg px-2 py-1 text-xs font-medium text-bg opacity-0 shadow-lift transition-opacity group-hover:opacity-100">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
