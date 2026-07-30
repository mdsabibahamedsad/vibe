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
        <span className="text-xs font-medium text-muted">
          Step {currentStep + 1} of {totalSteps}
        </span>
        <span className="text-xs font-semibold text-gradient">
          {Math.round(percentage)}%
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-surface-2 overflow-hidden">
        <div
          className="h-full rounded-full bg-brand-gradient transition-all duration-300 ease-out shadow-glow"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
