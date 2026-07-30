"use client";

import { useState } from "react";
import { Avatar, Button } from "@/components/ui";
import type { OtherUserInfo } from "@/features/chat/hooks/useChat";
import type { RealtimeStatus } from "@/features/chat/services/chat-realtime.service";

interface ChatHeaderProps {
  otherUser: OtherUserInfo | null;
  realtimeStatus: RealtimeStatus;
  onBack: () => void;
  onViewProfile?: () => void;
  onReport?: () => void;
  onBlock?: () => void;
  onUnmatch?: () => void;
}

/**
 * ChatHeader — Fixed header for the chat screen.
 *
 * Shows:
 *  - Back button
 *  - Avatar, display name, age
 *  - Connection status indicator
 *  - Menu with actions (View profile, Report, Block, Unmatch)
 */
export function ChatHeader({
  otherUser,
  realtimeStatus,
  onBack,
  onViewProfile,
  onReport,
  onBlock,
  onUnmatch,
}: ChatHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const statusIndicator = {
    connected: "text-green-500",
    disconnected: "text-gray-400",
    connecting: "text-yellow-500 animate-pulse",
    error: "text-red-500",
  };

  return (
    <header className="glass sticky top-0 z-10 border-b border-divider">
      <div className="flex items-center gap-2 px-2 py-2">
        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-surface-2 active:bg-surface-2/70 transition-colors"
          aria-label="Go back"
        >
          <svg className="w-5 h-5 text-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <Avatar
            src={otherUser?.avatarUrl}
            alt={otherUser?.displayName ?? "User"}
            size="md"
            fallback={otherUser?.displayName?.charAt(0) ?? "?"}
          />
        </div>

        {/* Name and status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-fg truncate">
              {otherUser?.displayName ?? "Chat"}
            </span>
            {otherUser?.age && (
              <span className="text-sm text-muted">
                {otherUser.age}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${statusIndicator[realtimeStatus]}`} />
            <span className="text-xs text-muted">
              {realtimeStatus === "connected"
                ? "Online"
                : realtimeStatus === "connecting"
                  ? "Connecting..."
                  : "Offline"}
            </span>
          </div>
        </div>

        {/* Menu button */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-surface-2 active:bg-surface-2/70 transition-colors"
            aria-label="Chat menu"
            aria-expanded={menuOpen}
          >
            <svg className="w-5 h-5 text-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01" />
            </svg>
          </button>

          {/* Dropdown menu */}
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-12 z-30 min-w-40 surface-card py-1">
                {onViewProfile && (
                  <MenuItem
                    label="View Profile"
                    icon={
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    }
                    onPress={() => { setMenuOpen(false); onViewProfile(); }}
                  />
                )}
                {onReport && (
                  <MenuItem
                    label="Report"
                    icon={
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                      </svg>
                    }
                    onPress={() => { setMenuOpen(false); onReport(); }}
                  />
                )}
                {onBlock && (
                  <MenuItem
                    label="Block"
                    icon={
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    }
                    onPress={() => { setMenuOpen(false); onBlock(); }}
                    danger
                  />
                )}
                {onUnmatch && (
                  <MenuItem
                    label="Unmatch"
                    icon={
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    }
                    onPress={() => { setMenuOpen(false); onUnmatch(); }}
                    danger
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuItem({
  label,
  icon,
  onPress,
  danger,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onPress}
      className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors ${
        danger
          ? "text-danger hover:bg-danger/10"
          : "text-fg hover:bg-surface-2"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
