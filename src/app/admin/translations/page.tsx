"use client";

import { useEffect, useState, useCallback } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { canSync, Permissions } from "@/lib/admin/permissions";
import { Loading, ErrorState } from "@/components/ui";
import {
  SUPPORTED_LANGUAGES,
  type I18nNamespace,
  FALLBACK_LANGUAGE,
} from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n/useTranslation";

const ALL_NAMESPACES: I18nNamespace[] = [
  "common", "navigation", "settings", "premium", "admin",
  "onboarding", "notifications", "feed", "dating", "chat",
  "stories", "search", "profile", "creator", "help",
  "support", "moderation", "errors", "time", "billing",
  "ads", "security", "referrals",
];

interface TranslationEntry {
  key: string;
  value: string;
  published: boolean;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
}

interface TranslationState {
  [language: string]: {
    [namespace: string]: TranslationEntry[];
  };
}

export default function AdminTranslationsPage() {
  const { user } = useCurrentUser();
  const { t } = useTranslation("admin");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLang, setSelectedLang] = useState<string>("en");
  const [selectedNs, setSelectedNs] = useState<I18nNamespace>("common");
  const [searchQuery, setSearchQuery] = useState("");
  const [translations, setTranslations] = useState<TranslationEntry[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft" | "missing">("all");

  useEffect(() => {
    if (!user || !canSync(user.role, Permissions.ADMIN_MANAGE)) {
      setLoading(false);
      return;
    }
    loadTranslations();
  }, [selectedLang, selectedNs, user]);

  async function loadTranslations() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/admin/translations?language=${selectedLang}&namespace=${selectedNs}`);
      const json = await res.json();
      if (json.success) {
        setTranslations(json.data ?? []);
      } else {
        setError(json.error ?? "Failed to load translations");
      }
    } catch {
      setError("Failed to load translations");
    } finally {
      setLoading(false);
    }
  }

  const handleSave = useCallback(async (key: string, value: string) => {
    try {
      const res = await fetch("/api/admin/translations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: selectedLang,
          namespace: selectedNs,
          key,
          value,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setEditingKey(null);
        loadTranslations();
      } else {
        alert(json.error ?? "Failed to save");
      }
    } catch {
      alert("Failed to save translation");
    }
  }, [selectedLang, selectedNs]);

  const handlePublish = useCallback(async (key: string, publish: boolean) => {
    try {
      const res = await fetch("/api/admin/translations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: selectedLang,
          namespace: selectedNs,
          key,
          publish,
        }),
      });
      const json = await res.json();
      if (json.success) {
        loadTranslations();
      } else {
        alert(json.error ?? "Failed to update");
      }
    } catch {
      alert("Failed to update translation");
    }
  }, [selectedLang, selectedNs]);

  const handleValidate = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/translations/validate?language=${selectedLang}&namespace=${selectedNs}`);
      const json = await res.json();
      if (json.success) {
        const issues = json.data ?? [];
        if (issues.length === 0) {
          alert(t("translations.validationPassed"));
        } else {
          alert(t("translations.validationFailed") + ": " + issues.map((i: any) => `${i.type}: ${i.key}`).join(", "));
        }
      }
    } catch {
      alert("Validation failed");
    }
  }, [selectedLang, selectedNs, t]);

  const filteredTranslations = translations.filter((entry) => {
    if (searchQuery && !entry.key.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (statusFilter === "published" && !entry.published) return false;
    if (statusFilter === "draft" && entry.published) return false;
    return true;
  });

  if (!user || !canSync(user.role, Permissions.ADMIN_MANAGE)) {
    return <div className="p-6 text-red-500">{t("accessDenied")}</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("translations.title")}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("translations.description")}</p>
      </div>

      <div className="flex flex-wrap gap-4 mb-6 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t("translations.selectLanguage")}</label>
          <select
            value={selectedLang}
            onChange={(e) => setSelectedLang(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.nativeName} ({lang.code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t("translations.selectNamespace")}</label>
          <select
            value={selectedNs}
            onChange={(e) => setSelectedNs(e.target.value as I18nNamespace)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
          >
            {ALL_NAMESPACES.map((ns) => (
              <option key={ns} value={ns}>{ns}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t("translations.status")}</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="published">{t("translations.published")}</option>
            <option value="draft">{t("translations.draft")}</option>
          </select>
        </div>

        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("translations.searchKeys")}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
          />
        </div>

        <button
          onClick={handleValidate}
          className="rounded-lg bg-blue-50 dark:bg-blue-900/30 px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100"
        >
          Validate
        </button>
      </div>

      {loading ? (
        <Loading message="Loading translations..." />
      ) : error ? (
        <ErrorState title="Error" message={error} onRetry={loadTranslations} />
      ) : (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{t("translations.key")}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{t("translations.value")}</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-500 w-24">{t("translations.status")}</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 w-40">{t("translations.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredTranslations.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                      {searchQuery ? t("translations.searchKeys") : "No translations found"}
                    </td>
                  </tr>
                )}
                {filteredTranslations.map((entry) => (
                  <tr key={entry.key} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                      {entry.key}
                    </td>
                    <td className="px-4 py-3">
                      {editingKey === entry.key ? (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="flex-1 rounded border border-blue-300 px-2 py-1 text-sm"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSave(entry.key, editValue)}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingKey(null)}
                            className="text-gray-400 hover:text-gray-600 text-xs"
                          >
                            {t("translations.discardChanges")}
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-900 dark:text-white break-all line-clamp-2">
                          {entry.value}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        entry.published
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                          : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
                      }`}>
                        {entry.published ? t("translations.published") : t("translations.draft")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => {
                            setEditingKey(entry.key);
                            setEditValue(entry.value);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          {t("translations.editTranslation")}
                        </button>
                        <button
                          onClick={() => handlePublish(entry.key, !entry.published)}
                          className={`text-xs font-medium ${
                            entry.published
                              ? "text-orange-600 hover:text-orange-800"
                              : "text-green-600 hover:text-green-800"
                          }`}
                        >
                          {entry.published ? t("translations.disableTranslation") : t("translations.publishTranslation")}
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {t("translations.version", { version: entry.version })}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
