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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur">
      <div
        className={`mx-6 w-full max-w-sm glass-dark rounded-3xl p-8 shadow-lift ${
          prefersReducedMotion.current ? "" : "animate-bounce-in"
        }`}
      >
        {/* Celebration Content */}
        <div className="flex flex-col items-center gap-6">
          {/* Heading */}
          <div className="text-center">
            <h2 className="font-display text-gradient text-4xl">
              It&apos;s a Match! 🎉
            </h2>
            <p className="mt-1 text-sm text-muted">
              You and {data.otherUserName} liked each other.
            </p>
          </div>

          {/* Profile images side by side */}
          <div className="flex items-center -space-x-4">
            {/* Current user avatar (placeholder — will be enhanced) */}
            <div className="ring-gradient rounded-full p-1 shadow-glow">
              <div className="w-20 h-20 rounded-full bg-surface-2 overflow-hidden flex items-center justify-center">
                <span className="text-2xl">👤</span>
              </div>
            </div>

            {/* Sparkle icon */}
            <div
              className={`z-10 flex items-center justify-center w-10 h-10 rounded-full bg-brand-gradient text-white text-lg shadow-glow ${
                prefersReducedMotion.current ? "" : "animate-pulse"
              }`}
            >
              💕
            </div>

            {/* Other user avatar */}
            <Avatar
              src={data.otherUserAvatarUrl}
              alt={data.otherUserName}
              size="xl"
              ring
              fallback={data.otherUserName.charAt(0)}
              className="w-20 h-20"
            />
          </div>

          {/* Names */}
          <p className="text-sm font-medium text-fg">
            You & {data.otherUserName}
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 w-full">
            <Button
              variant="gradient"
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
