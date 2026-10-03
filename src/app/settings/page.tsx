"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button, Card, Loading, FeedSkeleton } from "@/components/ui";
import { AppHeader } from "@/components/app-header";
import { DesktopNav } from "@/components/bottom-nav";
import { PhotoPicker } from "@/components/shared/photo-picker";
import { ProfilePreviewCard } from "@/components/shared/profile-preview-card";
import { LanguageSelector } from "@/components/language-selector";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { logger } from "@/lib/logger";

interface ProfileForm {
  displayName: string;
  bio: string;
  dateOfBirth: string;
  gender: string;
  city: string;
  country: string;
  datingIntent: string;
}

interface PhotoItem {
  id: string;
  mediaId: string | null;
  telegramFileId: string | null;
  url?: string | null;
  isPrimary: boolean;
  sortOrder: number;
}

interface InterestItem {
  id: string;
  name: string;
  slug: string;
}

type Tab = "profile" | "photos" | "interests" | "preferences" | "preview" | "settings";

export default function SettingsPage() {
  const router = useRouter();
  const { authenticated, loading: authLoading, user, logout } = useCurrentUser();
  const { t } = useTranslation("common");
  const { t: ts } = useTranslation("settings");
  const { t: tn } = useTranslation("navigation");
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Profile form
  const [form, setForm] = useState<ProfileForm>({
    displayName: "",
    bio: "",
    dateOfBirth: "",
    gender: "",
    city: "",
    country: "",
    datingIntent: "",
  });

  // Photos
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [uploading, setUploading] = useState(false);

  // Interests
  const [allInterests, setAllInterests] = useState<InterestItem[]>([]);
  const [selectedInterests, setSelectedInterests] = useState<Set<string>>(new Set());
  const [groupedInterests, setGroupedInterests] = useState<Record<string, InterestItem[]>>({});

  // Preferences
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(50);
  const [maxDistance, setMaxDistance] = useState(100);
  const [preferredGenders, setPreferredGenders] = useState<Set<string>>(
    new Set(["male", "female"]),
  );

  // Profile data for preview
  const [profileAge, setProfileAge] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !authenticated) {
      router.push("/");
    }
  }, [authLoading, authenticated, router]);

  const loadProfile = useCallback(async () => {
    try {
      const [profileRes, interestsRes, mediaRes, prefsRes] = await Promise.all([
        fetch("/api/profile"),
        fetch("/api/interests"),
        fetch("/api/profile/media"),
        fetch("/api/profile/preferences"),
      ]);

      const profileData = await profileRes.json();
      const interestsData = await interestsRes.json();
      const mediaData = await mediaRes.json();
      const prefsData = await prefsRes.json();

      if (profileData.profile) {
        const p = profileData.profile;
        setForm({
          displayName: p.displayName || "",
          bio: p.bio || "",
          dateOfBirth: p.dateOfBirth || "",
          gender: p.gender || "",
          city: p.city || "",
          country: p.country || "",
          datingIntent: p.datingIntent || "",
        });
        if (p.age) setProfileAge(p.age);
      }

      if (interestsData.interests) {
        setAllInterests(interestsData.interests);
        const groups: Record<string, InterestItem[]> = {};
        for (const i of interestsData.interests) {
          const cat = i.category || "Other";
          if (!groups[cat]) groups[cat] = [];
          groups[cat].push(i);
        }
        setGroupedInterests(groups);
      }

      if (mediaData.media) setPhotos(mediaData.media);

      if (prefsData.preferences) {
        const prefs = prefsData.preferences;
        setMinAge(prefs.minAge ?? 18);
        setMaxAge(prefs.maxAge ?? 50);
        setMaxDistance(prefs.maxDistanceKm ?? 100);
        if (prefs.preferredGenders) {
          setPreferredGenders(new Set(prefs.preferredGenders));
        }
      }

      // Load selected profile interests
      if (profileData.profile?.interests) {
        setSelectedInterests(new Set(profileData.profile.interests.map((i: InterestItem) => i.id)));
      }
    } catch (err) {
      logger.error("Failed to load profile data", {
        error: err instanceof Error ? err.message : "Unknown",
      });
      setError("Failed to load profile");
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated && !authLoading) loadProfile();
  }, [authenticated, authLoading, loadProfile]);

  const saveProfile = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) {
        const result = await response.json();
        setError(result.error || "Failed to save");
      }
    } catch {
      setError("Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const savePreferences = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/profile/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minAge,
          maxAge,
          maxDistanceKm: maxDistance,
          preferredGenders: Array.from(preferredGenders),
        }),
      });
      if (!response.ok) {
        const result = await response.json();
        setError(result.error || "Failed to save");
      }
    } catch {
      setError("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  const saveInterests = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/interests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interestIds: Array.from(selectedInterests) }),
      });
      if (!response.ok) {
        const result = await response.json();
        setError(result.error || "Failed to save");
      }
    } catch {
      setError("Failed to save interests");
    } finally {
      setSaving(false);
    }
  };

  const toggleInterest = (id: string) => {
    const next = new Set(selectedInterests);
    if (next.has(id)) next.delete(id);
    else {
      if (next.size < 15) next.add(id);
    }
    setSelectedInterests(next);
  };

  const handleAddPhoto = async (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Please upload a JPEG, PNG, or WebP image");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be less than 10MB");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/profile/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaType: "image",
          storageProvider: "supabase",
          storagePath: `profiles/${user?.id}/${Date.now()}_${file.name}`,
          mimeType: file.type,
          fileSize: file.size,
        }),
      });
      const result = await response.json();
      if (result.media) setPhotos((prev) => [...prev, { ...result.media, url: dataUrl }]);
    } catch {
      setError("Failed to upload photo");
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = async (photoId: string) => {
    const response = await fetch(`/api/profile/media?id=${photoId}`, { method: "DELETE" });
    if (response.ok) setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    else setError("Failed to remove photo");
  };

  const handleReorderPhotos = async (items: { id: string; sortOrder: number }[]) => {
    const response = await fetch("/api/profile/media", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (response.ok) {
      const result = await response.json();
      if (result.media) setPhotos(result.media);
    }
  };

  const handleSetPrimaryPhoto = async (photoId: string) => {
    const response = await fetch("/api/profile/media", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoId }),
    });
    if (response.ok) {
      const result = await response.json();
      if (result.media) setPhotos(result.media);
    }
  };

  if (authLoading || profileLoading)
    return (
      <div className="flex min-h-dvh flex-col">
        <AppHeader title={ts("title")} />
        <FeedSkeleton count={2} />
      </div>
    );
  if (!authenticated) return null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "profile", label: tn("tabs.profile") },
    { key: "photos", label: tn("tabs.photos") },
    { key: "interests", label: tn("tabs.interests") },
    { key: "preferences", label: tn("tabs.preferences") },
    { key: "preview", label: tn("tabs.preview") },
    { key: "settings", label: tn("tabs.account") },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <AppHeader
        title={ts("title")}
        leading={
          <button
            onClick={() => router.push("/")}
            className="rounded-full p-2 -ms-2 text-muted transition-colors hover:text-fg"
            aria-label={t("back")}
          >
            <svg className="h-5 w-5 rtl:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        }
      >
        {/* Tab bar */}
        <div className="mx-auto w-full max-w-2xl scrollbar-none flex gap-1.5 overflow-x-auto px-4 pb-2.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              aria-pressed={activeTab === tab.key}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all active:scale-95 ${
                activeTab === tab.key
                  ? "bg-brand-gradient text-white shadow-glow"
                  : "border border-divider bg-surface-2 text-muted hover:text-fg"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </AppHeader>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-medium">
            ×
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 p-4">
        {/* Profile Tab */}
        {activeTab === "profile" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-fg">
              {ts("editProfile")}
            </h2>

            <div>
              <label className="block text-sm font-medium mb-1 text-fg">
                {ts("displayName")}
              </label>
              <input
                type="text"
                value={form.displayName}
                onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
                className="w-full rounded-xl bg-surface-2 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-fg"
                maxLength={50}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-fg">
                {ts("bio")}
              </label>
              <textarea
                value={form.bio}
                onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))}
                className="w-full rounded-xl bg-surface-2 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none text-fg"
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-muted mt-1">
                {form.bio.length}/500
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1 text-fg">
                  {ts("gender")}
                </label>
                <select
                  value={form.gender}
                  onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}
                  className="w-full rounded-xl bg-surface-2 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-fg"
                >
                  <option value="">{t("select")}</option>
                  <option value="male">{t("gender.male")}</option>
                  <option value="female">{t("gender.female")}</option>
                  <option value="non_binary">{t("gender.nonBinary")}</option>
                  <option value="prefer_not_to_say">{t("gender.preferNotToSay")}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-fg">
                  {ts("lookingFor")}
                </label>
                <select
                  value={form.datingIntent}
                  onChange={(e) => setForm((p) => ({ ...p, datingIntent: e.target.value }))}
                  className="w-full rounded-xl bg-surface-2 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-fg"
                >
                  <option value="">{t("select")}</option>
                  <option value="dating">{t("datingIntent.dating")}</option>
                  <option value="friendship">{t("datingIntent.friendship")}</option>
                  <option value="chat">{t("datingIntent.chat")}</option>
                  <option value="relationship">{t("datingIntent.relationship")}</option>
                  <option value="not_sure">{t("datingIntent.notSure")}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1 text-fg">
                  {ts("city")}
                </label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                  className="w-full rounded-xl bg-surface-2 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-fg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-fg">
                  {ts("country")}
                </label>
                <input
                  type="text"
                  value={form.country}
                  onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
                  className="w-full rounded-xl bg-surface-2 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-fg"
                />
              </div>
            </div>

            <Button onClick={saveProfile} fullWidth loading={saving} disabled={saving}>
              {ts("saveProfile")}
            </Button>
          </div>
        )}

        {/* Photos Tab */}
        {activeTab === "photos" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-fg">
              {ts("yourPhotos")}
            </h2>
            <PhotoPicker
              photos={photos}
              maxPhotos={10}
              onAdd={handleAddPhoto}
              onRemove={handleRemovePhoto}
              onReorder={handleReorderPhotos}
              onSetPrimary={handleSetPrimaryPhoto}
              loading={uploading}
            />
          </div>
        )}

        {/* Interests Tab */}
        {activeTab === "interests" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-fg">
                {ts("interests")}
              </h2>
              <span className="text-sm text-muted">
                {selectedInterests.size}/15
              </span>
            </div>
            <div className="space-y-4">
              {Object.entries(groupedInterests).map(([category, items]) => (
                <div key={category}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                    {category}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {items.map((interest) => (
                      <button
                        key={interest.id}
                        onClick={() => toggleInterest(interest.id)}
                        className={`rounded-full px-3.5 py-2 text-sm font-medium transition-all ${
                          selectedInterests.has(interest.id)
                            ? "bg-primary text-white"
                            : "bg-surface-2 text-fg"
                        }`}
                      >
                        {interest.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Button
              onClick={saveInterests}
              fullWidth
              loading={saving}
              disabled={saving || selectedInterests.size < 1}
            >
              {ts("saveInterests")}
            </Button>
          </div>
        )}

        {/* Preferences Tab */}
        {activeTab === "preferences" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-fg">
              {ts("discoveryPreferences")}
            </h2>
            <div>
              <label className="text-sm font-medium text-fg">
                {ts("ageRange", { min: minAge, max: maxAge })}
              </label>
              <input
                type="range"
                min={18}
                max={60}
                value={minAge}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  setMinAge(v);
                  if (v > maxAge) setMaxAge(v);
                }}
                className="w-full accent-primary"
              />
              <input
                type="range"
                min={18}
                max={100}
                value={maxAge}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  setMaxAge(v);
                  if (v < minAge) setMinAge(v);
                }}
                className="w-full accent-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-fg">
                {ts("maxDistance", { distance: maxDistance })}
              </label>
              <input
                type="range"
                min={1}
                max={500}
                value={maxDistance}
                onChange={(e) => setMaxDistance(parseInt(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-fg mb-2">
                {t("gender.showMe")}
              </label>
              <div className="flex gap-2">
                {["male", "female", "non_binary"].map((g) => (
                  <button
                    key={g}
                    onClick={() => {
                      const n = new Set(preferredGenders);
                      if (n.has(g)) {
                        if (n.size > 1) n.delete(g);
                      } else n.add(g);
                      setPreferredGenders(n);
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                      preferredGenders.has(g)
                        ? "bg-primary text-white"
                        : "bg-surface-2 text-fg"
                    }`}
                  >
                    {g === "male"
                      ? t("gender.men")
                      : g === "female"
                        ? t("gender.women")
                        : t("gender.nonBinary")}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={savePreferences} fullWidth loading={saving} disabled={saving}>
              {ts("savePreferences")}
            </Button>
          </div>
        )}

        {/* Preview Tab */}
        {activeTab === "preview" && (
          <div className="max-w-xs mx-auto">
            <ProfilePreviewCard
              displayName={form.displayName || ts("yourName")}
              age={profileAge}
              city={form.city || undefined}
              country={form.country || undefined}
              bio={form.bio || undefined}
              datingIntent={form.datingIntent || undefined}
              interests={allInterests
                .filter((i) => selectedInterests.has(i.id))
                .map((i) => ({ name: i.name, slug: i.slug }))}
              photosCount={photos.length}
            />
          </div>
        )}

        {/* Account Settings Tab */}
        {activeTab === "settings" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-fg">
              {ts("account")}
            </h2>

            {/* Language */}
            <Card>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-fg">{ts("languageSection")}</p>
                  <p className="text-xs text-muted">{ts("selectLanguage")}</p>
                </div>
                <LanguageSelector variant="dropdown" />
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-fg">
                    {ts("deactivateAccount")}
                  </p>
                  <p className="text-xs text-muted">
                    {ts("deactivateDescription")}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (confirm(ts("deactivateConfirm"))) {
                      await fetch("/api/profile/deactivate", { method: "POST" });
                      router.push("/");
                    }
                  }}
                  className="rounded-full bg-danger px-4 py-2 text-sm font-semibold text-white transition-all active:scale-95"
                >
                  {ts("deactivate")}
                </button>
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-fg">
                    {ts("signOut")}
                  </p>
                  <p className="text-xs text-muted">
                    {ts("signOutDescription")}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    await fetch("/api/auth/logout", { method: "POST" });
                    await logout();
                    router.push("/");
                  }}
                  className="rounded-full bg-surface-2 border border-divider px-4 py-2 text-sm font-semibold text-fg transition-all active:scale-95"
                >
                  {ts("signOut")}
                </button>
              </div>
            </Card>
          </div>
        )}
      </div>

      <DesktopNav />
    </div>
  );
}
