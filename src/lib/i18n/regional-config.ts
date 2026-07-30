export interface RegionalConfig {
  region: string;
  languages: string[];
  currency: string;
  distanceUnit: "km" | "mi";
  dateFormat: string;
  timeFormat: string;
  firstDayOfWeek: 0 | 1;
  requiresAgeVerification: boolean;
  requiresConsent: boolean;
  dataResidencyRegion: string | null;
  features: RegionalFeatureFlags;
  compliance: RegionalCompliance;
}

export interface RegionalFeatureFlags {
  premium: boolean;
  advertising: boolean;
  creatorMonetization: boolean;
  liveStreaming: boolean;
  stories: boolean;
  dating: boolean;
  socialFeed: boolean;
  referralProgram: boolean;
}

export interface RegionalCompliance {
  minimumAge: number;
  requiresDataLocalization: boolean;
  requiresConsentBanner: boolean;
  requiresAgeGate: boolean;
  restrictedContentCategories: string[];
  advertisingRestrictions: string[];
  dataRetentionDays: number;
  requiresLegalReview: boolean;
  notes: string;
}

const defaultFeatures: RegionalFeatureFlags = {
  premium: true,
  advertising: true,
  creatorMonetization: true,
  liveStreaming: true,
  stories: true,
  dating: true,
  socialFeed: true,
  referralProgram: true,
};

const regionalConfigs: Record<string, RegionalConfig> = {
  DEFAULT: {
    region: "DEFAULT",
    languages: ["en"],
    currency: "XTR",
    distanceUnit: "km",
    dateFormat: "MM/DD/YYYY",
    timeFormat: "12h",
    firstDayOfWeek: 0,
    requiresAgeVerification: false,
    requiresConsent: false,
    dataResidencyRegion: null,
    features: { ...defaultFeatures },
    compliance: {
      minimumAge: 18,
      requiresDataLocalization: false,
      requiresConsentBanner: false,
      requiresAgeGate: false,
      restrictedContentCategories: [],
      advertisingRestrictions: [],
      dataRetentionDays: 365,
      requiresLegalReview: true,
      notes: "Default configuration — legal review required for each market.",
    },
  },
  EU: {
    region: "EU",
    languages: ["en", "fr", "es", "pt", "de"],
    currency: "XTR",
    distanceUnit: "km",
    dateFormat: "DD/MM/YYYY",
    timeFormat: "24h",
    firstDayOfWeek: 1,
    requiresAgeVerification: false,
    requiresConsent: true,
    dataResidencyRegion: "eu-central-1",
    features: { ...defaultFeatures },
    compliance: {
      minimumAge: 16,
      requiresDataLocalization: false,
      requiresConsentBanner: true,
      requiresAgeGate: false,
      restrictedContentCategories: ["hate_speech", "violence"],
      advertisingRestrictions: ["targeting_minors", "behavioral_ads_without_consent"],
      dataRetentionDays: 730,
      requiresLegalReview: true,
      notes: "GDPR compliance required. Consent management needed for data processing and advertising.",
    },
  },
  US: {
    region: "US",
    languages: ["en", "es"],
    currency: "XTR",
    distanceUnit: "mi",
    dateFormat: "MM/DD/YYYY",
    timeFormat: "12h",
    firstDayOfWeek: 0,
    requiresAgeVerification: false,
    requiresConsent: false,
    dataResidencyRegion: null,
    features: { ...defaultFeatures },
    compliance: {
      minimumAge: 18,
      requiresDataLocalization: false,
      requiresConsentBanner: false,
      requiresAgeGate: true,
      restrictedContentCategories: [],
      advertisingRestrictions: [],
      dataRetentionDays: 365,
      requiresLegalReview: true,
      notes: "COPPA compliance for users under 13. Age gate required. CCPA compliance if California users.",
    },
  },
  IN: {
    region: "IN",
    languages: ["en", "hi", "bn"],
    currency: "XTR",
    distanceUnit: "km",
    dateFormat: "DD/MM/YYYY",
    timeFormat: "12h",
    firstDayOfWeek: 0,
    requiresAgeVerification: true,
    requiresConsent: false,
    dataResidencyRegion: "ap-south-1",
    features: { ...defaultFeatures },
    compliance: {
      minimumAge: 18,
      requiresDataLocalization: true,
      requiresConsentBanner: false,
      requiresAgeGate: true,
      restrictedContentCategories: ["adult", "violence"],
      advertisingRestrictions: [],
      dataRetentionDays: 365,
      requiresLegalReview: true,
      notes: "IT Act compliance. Data localization requirements active.",
    },
  },
  BR: {
    region: "BR",
    languages: ["pt", "en", "es"],
    currency: "XTR",
    distanceUnit: "km",
    dateFormat: "DD/MM/YYYY",
    timeFormat: "24h",
    firstDayOfWeek: 0,
    requiresAgeVerification: true,
    requiresConsent: true,
    dataResidencyRegion: "sa-east-1",
    features: { ...defaultFeatures },
    compliance: {
      minimumAge: 18,
      requiresDataLocalization: false,
      requiresConsentBanner: true,
      requiresAgeGate: true,
      restrictedContentCategories: [],
      advertisingRestrictions: ["targeting_minors"],
      dataRetentionDays: 365,
      requiresLegalReview: true,
      notes: "LGPD compliance required. Age verification for dating features.",
    },
  },
  TR: {
    region: "TR",
    languages: ["tr", "en"],
    currency: "XTR",
    distanceUnit: "km",
    dateFormat: "DD/MM/YYYY",
    timeFormat: "24h",
    firstDayOfWeek: 1,
    requiresAgeVerification: true,
    requiresConsent: false,
    dataResidencyRegion: "eu-central-1",
    features: { ...defaultFeatures },
    compliance: {
      minimumAge: 18,
      requiresDataLocalization: false,
      requiresConsentBanner: false,
      requiresAgeGate: true,
      restrictedContentCategories: ["adult"],
      advertisingRestrictions: [],
      dataRetentionDays: 365,
      requiresLegalReview: true,
      notes: "KVKK compliance. Age verification required for dating features.",
    },
  },
  ID: {
    region: "ID",
    languages: ["id", "en"],
    currency: "XTR",
    distanceUnit: "km",
    dateFormat: "DD/MM/YYYY",
    timeFormat: "24h",
    firstDayOfWeek: 0,
    requiresAgeVerification: true,
    requiresConsent: false,
    dataResidencyRegion: "ap-southeast-1",
    features: { ...defaultFeatures },
    compliance: {
      minimumAge: 18,
      requiresDataLocalization: true,
      requiresConsentBanner: false,
      requiresAgeGate: true,
      restrictedContentCategories: ["adult", "lgbtq"],
      advertisingRestrictions: [],
      dataRetentionDays: 365,
      requiresLegalReview: true,
      notes: "ITE Law compliance. Content restrictions apply.",
    },
  },
  SA: {
    region: "SA",
    languages: ["ar", "en"],
    currency: "XTR",
    distanceUnit: "km",
    dateFormat: "DD/MM/YYYY",
    timeFormat: "24h",
    firstDayOfWeek: 0,
    requiresAgeVerification: true,
    requiresConsent: false,
    dataResidencyRegion: "me-south-1",
    features: {
      premium: true,
      advertising: true,
      creatorMonetization: true,
      liveStreaming: true,
      stories: true,
      dating: true,
      socialFeed: true,
      referralProgram: true,
    },
    compliance: {
      minimumAge: 21,
      requiresDataLocalization: true,
      requiresConsentBanner: false,
      requiresAgeGate: true,
      restrictedContentCategories: ["adult", "lgbtq", "violence", "religious"],
      advertisingRestrictions: ["religious_content", "alcohol", "gambling"],
      dataRetentionDays: 365,
      requiresLegalReview: true,
      notes: "Sharia-compliant content moderation required. Strict content restrictions.",
    },
  },
};

export function getRegionalConfig(region?: string): RegionalConfig {
  if (region && regionalConfigs[region]) {
    return regionalConfigs[region];
  }
  return regionalConfigs.DEFAULT;
}

export function getConfigForLanguage(language: string): RegionalConfig {
  for (const config of Object.values(regionalConfigs)) {
    if (config.languages.includes(language)) {
      return config;
    }
  }
  return regionalConfigs.DEFAULT;
}

export function getAllRegionalConfigs(): Record<string, RegionalConfig> {
  return { ...regionalConfigs };
}

export function getRegionByCountryCode(countryCode: string): string {
  const regionMap: Record<string, string> = {
    US: "US",
    GB: "EU",
    DE: "EU",
    FR: "EU",
    ES: "EU",
    IT: "EU",
    NL: "EU",
    BE: "EU",
    SE: "EU",
    DK: "EU",
    FI: "EU",
    PT: "EU",
    IE: "EU",
    AT: "EU",
    PL: "EU",
    IN: "IN",
    BR: "BR",
    TR: "TR",
    ID: "ID",
    SA: "SA",
    AE: "SA",
    QA: "SA",
    KW: "SA",
    BH: "SA",
    OM: "SA",
    BD: "IN",
    PK: "IN",
    LK: "IN",
    NP: "IN",
  };
  return regionMap[countryCode] ?? "DEFAULT";
}
