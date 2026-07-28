"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTelegramWebApp } from "@/hooks/use-telegram-webapp";
import { OnboardingProgress } from "@/components/shared/onboarding-progress";
import { Button } from "@/components/ui";
import { Loading } from "@/components/ui";
import { logger } from "@/lib/logger";

// Step components
import { StepBasicProfile } from "./steps/basic-profile";
import { StepDatingIntent } from "./steps/dating-intent";
import { StepInterests } from "./steps/interests";
import { StepPhotos } from "./steps/photos";
import { StepIntroVideo } from "./steps/intro-video";
import { StepDiscoveryPreferences } from "./steps/discovery-preferences";

const TOTAL_STEPS = 6;

export default function OnboardingPage() {
  const router = useRouter();
  const { authenticated, loading: authLoading, user } = useCurrentUser();
  const { isTelegram } = useTelegramWebApp();
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  // Redirect if already authenticated and doesn't need onboarding
  useEffect(() => {
    if (!authLoading && authenticated && user && !user.needsOnboarding && !redirecting) {
      setRedirecting(true);
      router.push("/");
    }
  }, [authLoading, authenticated, user, router, redirecting]);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!authLoading && !authenticated && !redirecting) {
      setRedirecting(true);
      router.push("/");
    }
  }, [authLoading, authenticated, router, redirecting]);

  const handleNext = useCallback(() => {
    setError(null);
    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentStep]);

  const handleBack = useCallback(() => {
    setError(null);
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentStep]);

  const handleComplete = useCallback(() => {
    setRedirecting(true);
    router.push("/");
  }, [router]);

  if (authLoading || redirecting) {
    return <Loading fullScreen message="Loading..." />;
  }

  if (!authenticated || !user) {
    return <Loading fullScreen message="Please sign in..." />;
  }

  const stepProps = {
    userId: user.id,
    onNext: handleNext,
    onBack: handleBack,
    onComplete: handleComplete,
    saving,
    setSaving,
    error,
    setError,
  };

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--tg-theme-bg-color,#ffffff)]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[var(--tg-theme-bg-color,#ffffff)] border-b border-[var(--tg-theme-secondary-bg-color,#f0f0f0)]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="w-20">
            {currentStep > 0 && (
              <button
                onClick={handleBack}
                className="flex items-center gap-1 text-sm text-[var(--tg-theme-button-color,#0088cc)]"
                disabled={saving}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Back
              </button>
            )}
          </div>
          <h1 className="text-sm font-semibold text-[var(--tg-theme-text-color,#000000)]">
            Create your profile
          </h1>
          <div className="w-20 text-right">
            <button
              onClick={() => router.push("/")}
              className="text-sm text-[var(--tg-theme-hint-color,#999999)]"
            >
              Skip
            </button>
          </div>
        </div>
        <OnboardingProgress currentStep={currentStep} totalSteps={TOTAL_STEPS} />
      </header>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}

      {/* Steps */}
      <div className="flex-1 px-4 py-6">
        {currentStep === 0 && <StepBasicProfile {...stepProps} />}
        {currentStep === 1 && <StepDatingIntent {...stepProps} />}
        {currentStep === 2 && <StepInterests {...stepProps} />}
        {currentStep === 3 && <StepPhotos {...stepProps} />}
        {currentStep === 4 && <StepIntroVideo {...stepProps} />}
        {currentStep === 5 && <StepDiscoveryPreferences {...stepProps} />}
      </div>
    </div>
  );
}
