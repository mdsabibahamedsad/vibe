"use client";

interface OnboardingProgressProps {
  currentStep: number;
  totalSteps: number;
}

export function OnboardingProgress({ currentStep, totalSteps }: OnboardingProgressProps) {
  const percentage = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="w-full px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[var(--tg-theme-hint-color,#999999)]">
          Step {currentStep + 1} of {totalSteps}
        </span>
        <span className="text-xs text-[var(--tg-theme-hint-color,#999999)]">
          {Math.round(percentage)}%
        </span>
      </div>
      <div className="h-1 w-full rounded-full bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--tg-theme-button-color,#0088cc)] transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
