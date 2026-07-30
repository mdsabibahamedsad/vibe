"use client";

import { useCallback, useState } from "react";
import { useNotificationPreferences } from "@/features/notifications/hooks/useNotificationPreferences";
import { Loading } from "@/components/ui";

/**
 * NotificationSettings — UI controls for notification preferences.
 *
 * Sections:
 *  - In-app notifications master toggle
 *  - Dating notifications
 *  - Message notifications
 *  - Social notifications
 *  - Telegram notifications
 *  - Quiet hours (foundation)
 */
export function NotificationSettings() {
  const { preferences, loading, update } = useNotificationPreferences();
  const [saving, setSaving] = useState(false);

  const handleToggle = useCallback(
    async (key: string, value: boolean) => {
      setSaving(true);
      try {
        await update({ [key]: value });
      } catch {
        // Error handled by hook
      } finally {
        setSaving(false);
      }
    },
    [update],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loading message="Loading settings..." />
      </div>
    );
  }

  return (
    <div className="divide-y divide-[var(--tg-theme-secondary-bg-color,#f0f0f0)]">
      {/* Section: In-App */}
      <Section title="In-App Notifications">
        <ToggleRow
          label="Enable notifications"
          description="Master toggle for all in-app notifications"
          enabled={preferences.inAppEnabled}
          onChange={(v) => handleToggle("inAppEnabled", v)}
          disabled={saving}
        />
      </Section>

      {/* Section: Dating */}
      <Section title="Dating">
        <ToggleRow
          label="Match notifications"
          description="When you get a new match"
          enabled={preferences.matchNotifications && preferences.inAppEnabled}
          onChange={(v) => handleToggle("matchNotifications", v)}
          disabled={saving || !preferences.inAppEnabled}
        />
      </Section>

      {/* Section: Messages */}
      <Section title="Messages">
        <ToggleRow
          label="New messages"
          description="When someone sends you a message"
          enabled={preferences.messageNotifications && preferences.inAppEnabled}
          onChange={(v) => handleToggle("messageNotifications", v)}
          disabled={saving || !preferences.inAppEnabled}
        />
      </Section>

      {/* Section: Social */}
      <Section title="Social">
        <ToggleRow
          label="New followers"
          description="When someone follows you"
          enabled={preferences.followNotifications && preferences.inAppEnabled}
          onChange={(v) => handleToggle("followNotifications", v)}
          disabled={saving || !preferences.inAppEnabled}
        />
        <ToggleRow
          label="Post activity"
          description="Likes and comments on your posts"
          enabled={preferences.postNotifications && preferences.inAppEnabled}
          onChange={(v) => handleToggle("postNotifications", v)}
          disabled={saving || !preferences.inAppEnabled}
        />
        <ToggleRow
          label="Story activity"
          description="Views and reactions to your stories"
          enabled={preferences.storyNotifications && preferences.inAppEnabled}
          onChange={(v) => handleToggle("storyNotifications", v)}
          disabled={saving || !preferences.inAppEnabled}
        />
      </Section>

      {/* Section: System */}
      <Section title="System">
        <ToggleRow
          label="System notifications"
          description="Account updates, safety notices, and feature updates"
          enabled={preferences.systemNotifications && preferences.inAppEnabled}
          onChange={(v) => handleToggle("systemNotifications", v)}
          disabled={saving || !preferences.inAppEnabled}
        />
      </Section>

      {/* Section: Telegram */}
      <Section title="Telegram Notifications">
        <ToggleRow
          label="Telegram notifications"
          description="Receive notifications via Telegram bot"
          enabled={preferences.telegramEnabled && preferences.inAppEnabled}
          onChange={(v) => handleToggle("telegramEnabled", v)}
          disabled={saving || !preferences.inAppEnabled}
        />
        {preferences.telegramEnabled && (
          <p className="px-4 pb-2 text-xs text-[var(--tg-theme-hint-color,#999999)]">
            Make sure you have started a conversation with the bot to receive Telegram notifications.
          </p>
        )}
      </Section>

      {/* Section: Quiet Hours (Foundation) */}
      <Section title="Quiet Hours">
        <ToggleRow
          label="Quiet hours"
          description="Pause Telegram notifications during specific hours"
          enabled={preferences.quietHoursEnabled && preferences.telegramEnabled}
          onChange={(v) => handleToggle("quietHoursEnabled", v)}
          disabled={saving || !preferences.telegramEnabled}
        />
        {preferences.quietHoursEnabled && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-[var(--tg-theme-hint-color,#999999)]">
              <span>22:00</span>
              <span className="text-xs">→</span>
              <span>08:00</span>
            </div>
            <p className="text-xs text-[var(--tg-theme-hint-color,#999999)] mt-1">
              Timezone: {preferences.timezone}
            </p>
          </div>
        )}
      </Section>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <h3 className="px-4 py-2 text-xs font-semibold text-[var(--tg-theme-hint-color,#999999)] uppercase tracking-wider">
        {title}
      </h3>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  enabled,
  onChange,
  disabled = false,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className="flex items-center justify-between w-full px-4 py-3 text-left disabled:opacity-40"
      aria-label={`${label}: ${enabled ? "enabled" : "disabled"}`}
    >
      <div className="flex-1 min-w-0 pr-3">
        <p className="text-sm text-[var(--tg-theme-text-color,#000000)]">{label}</p>
        <p className="text-xs text-[var(--tg-theme-hint-color,#999999)] mt-0.5">{description}</p>
      </div>
      <div
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
          enabled
            ? "bg-[var(--tg-theme-button-color,#0088cc)]"
            : "bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)]"
        }`}
      >
        <div
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
            enabled ? "translate-x-5" : ""
          }`}
        />
      </div>
    </button>
  );
}
