"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar, Button } from "@/components/ui";

interface MatchCelebrationData {
  matchId: string;
  otherUserName: string;
  otherUserAvatarUrl: string | null;
  otherUserId: string;
}

interface MatchCelebrationProps {
  data: MatchCelebrationData;
  onContinueDiscovering: () => void;
  onViewMatch: () => void;
}

/**
 * MatchCelebration — Lightweight celebration overlay shown when
 * a mutual match is created.
 *
 * Shows:
 *  - Both profile images
 *  - Names
 *  - "It's a Match!" heading
 *  - Continue discovering / View match buttons
 *
 * Respects reduced-motion preferences.
 */
export function MatchCelebration({
  data,
  onContinueDiscovering,
  onViewMatch,
}: MatchCelebrationProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Small delay for animation
    const timer = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Respect reduced motion
  const prefersReducedMotion = useRef(false);
  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        className={`mx-6 w-full max-w-sm rounded-3xl bg-[var(--tg-theme-bg-color,#ffffff)] dark:bg-gray-800 p-8 shadow-2xl ${
          prefersReducedMotion.current ? "" : "animate-bounce-in"
        }`}
      >
        {/* Celebration Content */}
        <div className="flex flex-col items-center gap-6">
          {/* Heading */}
          <div className="text-center">
            <h2 className="text-2xl font-bold text-[var(--tg-theme-text-color,#000000)]">
              It&apos;s a Match! 🎉
            </h2>
            <p className="mt-1 text-sm text-[var(--tg-theme-hint-color,#999999)]">
              You and {data.otherUserName} liked each other.
            </p>
          </div>

          {/* Profile images side by side */}
          <div className="flex items-center -space-x-4">
            {/* Current user avatar (placeholder — will be enhanced) */}
            <div className="w-20 h-20 rounded-full border-4 border-white shadow-lg overflow-hidden bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)]">
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-2xl">👤</span>
              </div>
            </div>

            {/* Sparkle icon */}
            <div
              className={`z-10 flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 text-white text-lg shadow-lg ${
                prefersReducedMotion.current ? "" : "animate-pulse"
              }`}
            >
              💕
            </div>

            {/* Other user avatar */}
            <div className="w-20 h-20 rounded-full border-4 border-white shadow-lg overflow-hidden">
              <Avatar
                src={data.otherUserAvatarUrl}
                alt={data.otherUserName}
                size="xl"
                fallback={data.otherUserName.charAt(0)}
                className="w-full h-full"
              />
            </div>
          </div>

          {/* Names */}
          <p className="text-sm font-medium text-[var(--tg-theme-text-color,#000000)]">
            You & {data.otherUserName}
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 w-full">
            <Button
              variant="primary"
              onClick={onViewMatch}
              fullWidth
            >
              Say Hello! 👋
            </Button>
            <Button
              variant="secondary"
              onClick={onContinueDiscovering}
              fullWidth
            >
              Keep Discovering
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
