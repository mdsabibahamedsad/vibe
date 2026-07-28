"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button, Card, Loading } from "@/components/ui";
import { PhotoPicker } from "@/components/shared/photo-picker";
import { ProfilePreviewCard } from "@/components/shared/profile-preview-card";
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

  if (authLoading || profileLoading) return <Loading fullScreen message="Loading profile..." />;
  if (!authenticated) return null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "profile", label: "Profile" },
    { key: "photos", label: "Photos" },
    { key: "interests", label: "Interests" },
    { key: "preferences", label: "Discovery" },
    { key: "preview", label: "Preview" },
    { key: "settings", label: "Account" },
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--tg-theme-bg-color,#ffffff)]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[var(--tg-theme-secondary-bg-color,#f0f0f0)] bg-[var(--tg-theme-bg-color,#ffffff)]">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => router.push("/")}
            className="text-sm text-[var(--tg-theme-button-color,#0088cc)]"
          >
            Back
          </button>
          <h1 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">
            Settings
          </h1>
          <div className="w-12" />
        </div>

        {/* Tab bar */}
        <div className="flex overflow-x-auto gap-1 px-4 pb-0 scrollbar-none">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-[var(--tg-theme-button-color,#0088cc)] text-[var(--tg-theme-button-color,#0088cc)]"
                  : "border-transparent text-[var(--tg-theme-hint-color,#999999)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

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
            <h2 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">
              Edit Profile
            </h2>

            <div>
              <label className="block text-sm font-medium mb-1 text-[var(--tg-theme-text-color,#000000)]">
                Display Name
              </label>
              <input
                type="text"
                value={form.displayName}
                onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
                className="w-full rounded-xl bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-button-color,#0088cc)]/50 text-[var(--tg-theme-text-color,#000000)]"
                maxLength={50}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-[var(--tg-theme-text-color,#000000)]">
                Bio
              </label>
              <textarea
                value={form.bio}
                onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))}
                className="w-full rounded-xl bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-button-color,#0088cc)]/50 resize-none text-[var(--tg-theme-text-color,#000000)]"
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-[var(--tg-theme-hint-color,#999999)] mt-1">
                {form.bio.length}/500
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1 text-[var(--tg-theme-text-color,#000000)]">
                  Gender
                </label>
                <select
                  value={form.gender}
                  onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}
                  className="w-full rounded-xl bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-button-color,#0088cc)]/50 text-[var(--tg-theme-text-color,#000000)]"
                >
                  <option value="">Select...</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="non_binary">Non-binary</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-[var(--tg-theme-text-color,#000000)]">
                  Looking for
                </label>
                <select
                  value={form.datingIntent}
                  onChange={(e) => setForm((p) => ({ ...p, datingIntent: e.target.value }))}
                  className="w-full rounded-xl bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-button-color,#0088cc)]/50 text-[var(--tg-theme-text-color,#000000)]"
                >
                  <option value="">Select...</option>
                  <option value="dating">Dating</option>
                  <option value="friendship">Friendship</option>
                  <option value="chat">Chat</option>
                  <option value="relationship">Relationship</option>
                  <option value="not_sure">Not sure yet</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1 text-[var(--tg-theme-text-color,#000000)]">
                  City
                </label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                  className="w-full rounded-xl bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-button-color,#0088cc)]/50 text-[var(--tg-theme-text-color,#000000)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-[var(--tg-theme-text-color,#000000)]">
                  Country
                </label>
                <input
                  type="text"
                  value={form.country}
                  onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
                  className="w-full rounded-xl bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-button-color,#0088cc)]/50 text-[var(--tg-theme-text-color,#000000)]"
                />
              </div>
            </div>

            <Button onClick={saveProfile} fullWidth loading={saving} disabled={saving}>
              Save Profile
            </Button>
          </div>
        )}

        {/* Photos Tab */}
        {activeTab === "photos" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">
              Your Photos
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
              <h2 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">
                Interests
              </h2>
              <span className="text-sm text-[var(--tg-theme-hint-color,#999999)]">
                {selectedInterests.size}/15
              </span>
            </div>
            <div className="space-y-4">
              {Object.entries(groupedInterests).map(([category, items]) => (
                <div key={category}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--tg-theme-hint-color,#999999)] mb-2">
                    {category}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {items.map((interest) => (
                      <button
                        key={interest.id}
                        onClick={() => toggleInterest(interest.id)}
                        className={`rounded-full px-3.5 py-2 text-sm font-medium transition-all ${
                          selectedInterests.has(interest.id)
                            ? "bg-[var(--tg-theme-button-color,#0088cc)] text-white"
                            : "bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] text-[var(--tg-theme-text-color,#000000)]"
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
              Save Interests
            </Button>
          </div>
        )}

        {/* Preferences Tab */}
        {activeTab === "preferences" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">
              Discovery Preferences
            </h2>
            <div>
              <label className="text-sm font-medium text-[var(--tg-theme-text-color,#000000)]">
                Age range: {minAge}–{maxAge}
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
                className="w-full accent-[var(--tg-theme-button-color,#0088cc)]"
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
                className="w-full accent-[var(--tg-theme-button-color,#0088cc)]"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--tg-theme-text-color,#000000)]">
                Max distance: {maxDistance} km
              </label>
              <input
                type="range"
                min={1}
                max={500}
                value={maxDistance}
                onChange={(e) => setMaxDistance(parseInt(e.target.value))}
                className="w-full accent-[var(--tg-theme-button-color,#0088cc)]"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--tg-theme-text-color,#000000)] mb-2">
                Show me
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
                        ? "bg-[var(--tg-theme-button-color,#0088cc)] text-white"
                        : "bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] text-[var(--tg-theme-text-color,#000000)]"
                    }`}
                  >
                    {g === "male" ? "Men" : g === "female" ? "Women" : "Non-binary"}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={savePreferences} fullWidth loading={saving} disabled={saving}>
              Save Preferences
            </Button>
          </div>
        )}

        {/* Preview Tab */}
        {activeTab === "preview" && (
          <div className="max-w-xs mx-auto">
            <ProfilePreviewCard
              displayName={form.displayName || "Your Name"}
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
            <h2 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">
              Account
            </h2>
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--tg-theme-text-color,#000000)]">
                    Deactivate Account
                  </p>
                  <p className="text-xs text-[var(--tg-theme-hint-color,#999999)]">
                    Temporarily hide your profile
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (confirm("Are you sure you want to deactivate your account?")) {
                      await fetch("/api/profile/deactivate", { method: "POST" });
                      router.push("/");
                    }
                  }}
                  className="rounded-lg bg-red-500 px-4 py-2 text-sm text-white"
                >
                  Deactivate
                </button>
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--tg-theme-text-color,#000000)]">
                    Sign Out
                  </p>
                  <p className="text-xs text-[var(--tg-theme-hint-color,#999999)]">
                    Log out of your account
                  </p>
                </div>
                <button
                  onClick={async () => {
                    await fetch("/api/auth/logout", { method: "POST" });
                    await logout();
                    router.push("/");
                  }}
                  className="rounded-lg bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] px-4 py-2 text-sm text-[var(--tg-theme-text-color,#000000)]"
                >
                  Sign Out
                </button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
