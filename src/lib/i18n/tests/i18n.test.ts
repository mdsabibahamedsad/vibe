import { describe, it, expect, beforeEach } from "vitest";
import { translate, translatePlural, interpolate, clearCache, loadNamespace } from "../engine";
import { formatDate, formatNumber, formatCurrency, formatRelativeTime, formatCompactNumber, formatDistance, formatAge } from "../formatters";
import { detectLanguage, getSavedLanguage, saveLanguagePreference } from "../language-detection";
import { getRegionalConfig, getConfigForLanguage } from "../regional-config";
import { getLanguage, isRtl, SUPPORTED_LANGUAGES } from "../types";

describe("i18n Engine", () => {
  beforeEach(() => {
    clearCache();
  });

  it("should return key as fallback when translation not found", () => {
    const result = translate("nonexistent.key", {}, "en", "common");
    expect(result).toBe("nonexistent.key");
  });

  it("should interpolate parameters", () => {
    const result = interpolate("Hello {name}", { name: "World" });
    expect(result).toBe("Hello World");
  });

  it("should interpolate multiple parameters", () => {
    const result = interpolate("{count} items in {category}", { count: 5, category: "Favorites" });
    expect(result).toBe("5 items in Favorites");
  });

  it("should handle missing parameters gracefully", () => {
    const result = interpolate("Hello {name}, you have {count}", { name: "Test" });
    expect(result).toBe("Hello Test, you have {count}");
  });

  it("should handle pluralization", () => {
    const singular = "1 item";
    const plural = "{count} items";
    expect(translatePlural(singular, plural, 1)).toBe("1 item");
    expect(translatePlural(singular, plural, 5)).toBe("5 items");
  });
});

describe("Formatters", () => {
  it("should format dates", () => {
    const date = new Date("2024-01-15");
    const result = formatDate(date, "en", { month: "long", day: "numeric", year: "numeric" });
    expect(result).toBe("January 15, 2024");
  });

  it("should format numbers with locale", () => {
    expect(formatNumber(1234567, "en")).toBe("1,234,567");
    expect(formatNumber(1234.56, "de")).toBe("1.234,56");
  });

  it("should format compact numbers", () => {
    expect(formatCompactNumber(1500, "en")).toBe("1.5K");
    expect(formatCompactNumber(2500000, "en")).toBe("2.5M");
    expect(formatCompactNumber(500, "en")).toBe("500");
  });

  it("should format distance", () => {
    expect(formatDistance(100, "km", "en")).toBe("100 km");
  });

  it("should calculate age correctly", () => {
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 25);
    expect(formatAge(dob)).toBe(25);
  });

  it("should format currency", () => {
    const result = formatCurrency(100, "XTR", "en");
    expect(result).toContain("⭐");
    expect(result).toContain("100");
  });
});

describe("Language Detection", () => {
  beforeEach(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("vibe_language");
    }
  });

  it("should save and retrieve language preference", () => {
    saveLanguagePreference("es");
    const saved = getSavedLanguage();
    expect(saved).toBe("es");
  });

  it("should return null when no preference saved", () => {
    const saved = getSavedLanguage();
    expect(saved).toBeNull();
  });
});

describe("Supported Languages", () => {
  it("should have 9 supported languages", () => {
    expect(SUPPORTED_LANGUAGES.length).toBe(9);
  });

  it("should have English as first language", () => {
    expect(SUPPORTED_LANGUAGES[0].code).toBe("en");
  });

  it("should include all required languages", () => {
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    expect(codes).toContain("en");
    expect(codes).toContain("bn");
    expect(codes).toContain("hi");
    expect(codes).toContain("ar");
    expect(codes).toContain("es");
    expect(codes).toContain("pt");
    expect(codes).toContain("id");
    expect(codes).toContain("tr");
    expect(codes).toContain("fr");
  });

  it("should identify RTL languages correctly", () => {
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("en")).toBe(false);
    expect(isRtl("es")).toBe(false);
  });

  it("should have correct language metadata", () => {
    const en = getLanguage("en");
    expect(en.dir).toBe("ltr");
    expect(en.name).toBe("English");
    expect(en.nativeName).toBe("English");

    const ar = getLanguage("ar");
    expect(ar.dir).toBe("rtl");
    expect(ar.name).toBe("Arabic");
    expect(ar.nativeName).toBe("العربية");
  });
});

describe("Regional Config", () => {
  it("should return default config for unknown region", () => {
    const config = getRegionalConfig("UNKNOWN");
    expect(config.region).toBe("DEFAULT");
    expect(config.currency).toBe("XTR");
  });

  it("should return EU config with GDPR requirements", () => {
    const config = getRegionalConfig("EU");
    expect(config.compliance.requiresConsentBanner).toBe(true);
    expect(config.compliance.dataRetentionDays).toBe(730);
    expect(config.distanceUnit).toBe("km");
    expect(config.timeFormat).toBe("24h");
  });

  it("should return US config with miles", () => {
    const config = getRegionalConfig("US");
    expect(config.distanceUnit).toBe("mi");
    expect(config.timeFormat).toBe("12h");
  });

  it("should return IN config with data localization", () => {
    const config = getRegionalConfig("IN");
    expect(config.compliance.requiresDataLocalization).toBe(true);
    expect(config.dataResidencyRegion).toBe("ap-south-1");
  });

  it("should get config for language", () => {
    const config = getConfigForLanguage("es");
    expect(config).toBeDefined();
  });
});

describe("Translation Files Structure", () => {
  const languages = ["en", "bn", "hi", "ar", "es", "pt", "id", "tr", "fr"];

  it("should have translation directory for each language", () => {
    languages.forEach((lang) => {
      const fs = require("fs");
      const path = require("path");
      const dir = path.join(process.cwd(), "src", "lib", "i18n", "translations", lang);
      expect(fs.existsSync(dir)).toBe(true);
    });
  });

  it("should have valid JSON files for English", () => {
    const fs = require("fs");
    const path = require("path");
    const enDir = path.join(process.cwd(), "src", "lib", "i18n", "translations", "en");
    const files = fs.readdirSync(enDir).filter((f: string) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);

    files.forEach((file: string) => {
      const content = fs.readFileSync(path.join(enDir, file), "utf-8");
      expect(() => JSON.parse(content)).not.toThrow();
    });
  });

  it("should have matching namespaces across all languages", () => {
    const fs = require("fs");
    const path = require("path");
    const enDir = path.join(process.cwd(), "src", "lib", "i18n", "translations", "en");
    const enFiles = new Set(fs.readdirSync(enDir));

    languages.slice(1).forEach((lang) => {
      const langDir = path.join(process.cwd(), "src", "lib", "i18n", "translations", lang);
      if (fs.existsSync(langDir)) {
        const langFiles = new Set(fs.readdirSync(langDir));
        enFiles.forEach((file) => {
          expect(langFiles.has(file)).toBe(true);
        });
      }
    });
  });
});
