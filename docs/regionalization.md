# Regionalization

## Overview

Regional configuration allows Vibe to adapt to different markets without duplicating business logic. Each region can have different:

- Languages
- Feature availability
- Compliance requirements
- Content restrictions
- Data residency
- Display formats

## Configuration

Defined in `src/lib/i18n/regional-config.ts`.

### Feature Flags

Each region can enable/disable:
- Premium subscriptions
- Advertising
- Creator monetization
- Live streaming
- Stories
- Dating
- Social feed
- Referral program

### Compliance

Each region specifies:
- Minimum age
- Data localization requirements
- Consent banner requirements
- Age gate requirements
- Restricted content categories
- Advertising restrictions
- Data retention period

## Regions

| Region | Languages | Data Residency | Key Compliance |
|--------|-----------|----------------|----------------|
| DEFAULT | en | None | Legal review required |
| EU | en, fr, es, pt, de | eu-central-1 | GDPR |
| US | en, es | None | COPPA, CCPA |
| IN | en, hi, bn | ap-south-1 | IT Act |
| BR | pt, en, es | sa-east-1 | LGPD |
| TR | tr, en | eu-central-1 | KVKK |
| ID | id, en | ap-southeast-1 | ITE Law |
| SA | ar, en | me-south-1 | Sharia compliance |

## Usage

```tsx
import { getRegionalConfig, getRegionByCountryCode } from "@/lib/i18n/regional-config";

const region = getRegionByCountryCode("US");
const config = getRegionalConfig(region);

// Feature check
if (config.features.dating) {
  // Show dating features
}

// Compliance
if (config.compliance.requiresConsentBanner) {
  // Show consent banner
}
```

## Data Residency

The architecture supports future data residency requirements:

- Database: Supabase project (configurable region)
- File storage: Supabase storage (configurable region)
- AI processing: Configurable provider
- CDN: Configurable edge network

Current data locations:
- Primary database: Configured via `NEXT_PUBLIC_SUPABASE_URL`
- Media storage: Supabase storage, same region as database
- AI services: Configurable via `NEXT_PUBLIC_AI_TRANSLATION_PROVIDER`

## Legal Disclaimer

Regional compliance configurations are templates only. Legal review is required for each market before launch. The system provides the infrastructure to implement compliance requirements but does not automatically ensure legal compliance.
