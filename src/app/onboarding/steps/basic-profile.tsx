"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { logger } from "@/lib/logger";
import { calculateAge } from "@/lib/validation/profile";

interface StepProps {
  userId: string;
  onNext: () => void;
  onBack: () => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
  error: string | null;
  setError: (v: string | null) => void;
}

interface FormData {
  displayName: string;
  dateOfBirth: string;
  gender: string;
  city: string;
  country: string;
  bio: string;
}

export function StepBasicProfile({ onNext, saving, setSaving, setError }: StepProps) {
  const [form, setForm] = useState<FormData>({
    displayName: "",
    dateOfBirth: "",
    gender: "",
    city: "",
    country: "",
    bio: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleChange = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!form.displayName || form.displayName.length < 2) {
      errors.displayName = "Display name must be at least 2 characters";
    }
    if (form.displayName.length > 50) {
      errors.displayName = "Display name must be 50 characters or less";
    }
    if (!form.dateOfBirth) {
      errors.dateOfBirth = "Date of birth is required";
    } else {
      const age = calculateAge(form.dateOfBirth);
      if (age < 18) {
        errors.dateOfBirth = "You must be at least 18 years old";
      }
    }
    if (!form.gender) {
      errors.gender = "Please select your gender";
    }
    if (!form.city) {
      errors.city = "City is required";
    }
    if (!form.country) {
      errors.country = "Country is required";
    }
    if (form.bio && form.bio.length > 500) {
      errors.bio = "Bio must be 500 characters or less";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to save profile");
        return;
      }

      onNext();
    } catch (err) {
      logger.error("Profile save error", { error: err instanceof Error ? err.message : "Unknown" });
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const today = new Date().toISOString().split("T")[0];
  const isFormValid = form.displayName.length >= 2 && form.gender && form.city && form.country;

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold text-[var(--tg-theme-text-color,#000000)]">
          Basic Information
        </h2>
        <p className="text-sm text-[var(--tg-theme-hint-color,#999999)]">
          Let&apos;s start with the basics
        </p>
      </div>

      {/* Display Name */}
      <div>
        <label className="block text-sm font-medium text-[var(--tg-theme-text-color,#000000)] mb-1">
          Display Name *
        </label>
        <input
          type="text"
          value={form.displayName}
          onChange={(e) => handleChange("displayName", e.target.value)}
          placeholder="Your name"
          maxLength={50}
          className="w-full rounded-xl bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] px-4 py-3 text-sm text-[var(--tg-theme-text-color,#000000)] placeholder:text-[var(--tg-theme-hint-color,#999999)] focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-button-color,#0088cc)]/50"
        />
        {fieldErrors.displayName && (
          <p className="mt-1 text-xs text-red-500">{fieldErrors.displayName}</p>
        )}
      </div>

      {/* Date of Birth */}
      <div>
        <label className="block text-sm font-medium text-[var(--tg-theme-text-color,#000000)] mb-1">
          Date of Birth *
        </label>
        <input
          type="date"
          value={form.dateOfBirth}
          onChange={(e) => handleChange("dateOfBirth", e.target.value)}
          max={today}
          className="w-full rounded-xl bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] px-4 py-3 text-sm text-[var(--tg-theme-text-color,#000000)] focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-button-color,#0088cc)]/50"
        />
        <p className="mt-1 text-xs text-[var(--tg-theme-hint-color,#999999)]">
          Your age will be shown publicly, not your exact birth date
        </p>
        {fieldErrors.dateOfBirth && (
          <p className="mt-1 text-xs text-red-500">{fieldErrors.dateOfBirth}</p>
        )}
      </div>

      {/* Gender */}
      <div>
        <label className="block text-sm font-medium text-[var(--tg-theme-text-color,#000000)] mb-1">
          Gender *
        </label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: "male", label: "Male" },
            { value: "female", label: "Female" },
            { value: "non_binary", label: "Non-binary" },
            { value: "prefer_not_to_say", label: "Prefer not to say" },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => handleChange("gender", option.value)}
              className={`rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                form.gender === option.value
                  ? "bg-[var(--tg-theme-button-color,#0088cc)] text-[var(--tg-theme-button-text-color,#ffffff)]"
                  : "bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] text-[var(--tg-theme-text-color,#000000)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {fieldErrors.gender && <p className="mt-1 text-xs text-red-500">{fieldErrors.gender}</p>}
      </div>

      {/* City + Country */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-[var(--tg-theme-text-color,#000000)] mb-1">
            City *
          </label>
          <input
            type="text"
            value={form.city}
            onChange={(e) => handleChange("city", e.target.value)}
            placeholder="e.g. Dhaka"
            className="w-full rounded-xl bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] px-4 py-3 text-sm text-[var(--tg-theme-text-color,#000000)] placeholder:text-[var(--tg-theme-hint-color,#999999)] focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-button-color,#0088cc)]/50"
          />
          {fieldErrors.city && <p className="mt-1 text-xs text-red-500">{fieldErrors.city}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--tg-theme-text-color,#000000)] mb-1">
            Country *
          </label>
          <input
            type="text"
            value={form.country}
            onChange={(e) => handleChange("country", e.target.value)}
            placeholder="e.g. Bangladesh"
            className="w-full rounded-xl bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] px-4 py-3 text-sm text-[var(--tg-theme-text-color,#000000)] placeholder:text-[var(--tg-theme-hint-color,#999999)] focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-button-color,#0088cc)]/50"
          />
          {fieldErrors.country && (
            <p className="mt-1 text-xs text-red-500">{fieldErrors.country}</p>
          )}
        </div>
      </div>

      {/* Bio */}
      <div>
        <label className="block text-sm font-medium text-[var(--tg-theme-text-color,#000000)] mb-1">
          Bio
        </label>
        <textarea
          value={form.bio}
          onChange={(e) => handleChange("bio", e.target.value)}
          placeholder="Tell people a bit about yourself..."
          maxLength={500}
          rows={3}
          className="w-full rounded-xl bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] px-4 py-3 text-sm text-[var(--tg-theme-text-color,#000000)] placeholder:text-[var(--tg-theme-hint-color,#999999)] focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-button-color,#0088cc)]/50 resize-none"
        />
        <div className="flex justify-between mt-1">
          {fieldErrors.bio && <p className="text-xs text-red-500">{fieldErrors.bio}</p>}
          <p className="text-xs text-[var(--tg-theme-hint-color,#999999)] ml-auto">
            {form.bio.length}/500
          </p>
        </div>
      </div>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        fullWidth
        loading={saving}
        disabled={!isFormValid || saving}
        size="lg"
      >
        Continue
      </Button>
    </div>
  );
}
