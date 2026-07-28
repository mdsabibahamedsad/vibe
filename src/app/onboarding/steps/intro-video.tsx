"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

interface StepProps {
  userId: string;
  onNext: () => void;
  onBack: () => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
  error: string | null;
  setError: (v: string | null) => void;
  onComplete: () => void;
}

export function StepIntroVideo({ onNext }: StepProps) {
  const [hasVideo, setHasVideo] = useState(false);

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold text-[var(--tg-theme-text-color,#000000)]">
          Intro Video (Optional)
        </h2>
        <p className="text-sm text-[var(--tg-theme-hint-color,#999999)]">
          Add a short video introduction to stand out
        </p>
      </div>

      <div className="aspect-[9/16] max-h-[400px] rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] flex items-center justify-center mx-auto">
        {hasVideo ? (
          <div className="flex flex-col items-center gap-3 text-[var(--tg-theme-hint-color,#999999)]">
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm">Video ready</p>
          </div>
        ) : (
          <label className="flex flex-col items-center gap-3 cursor-pointer text-[var(--tg-theme-hint-color,#999999)] hover:text-[var(--tg-theme-button-color,#0088cc)] transition-colors">
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
              />
            </svg>
            <p className="text-sm font-medium">Tap to record</p>
            <p className="text-xs">Max 60 seconds</p>
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={() => setHasVideo(true)}
            />
          </label>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Button onClick={onNext} fullWidth size="lg">
          {hasVideo ? "Continue" : "Skip for now"}
        </Button>
      </div>
    </div>
  );
}
