# Compliance-Readiness Matrix

> **IMPORTANT DISCLAIMER**: This document identifies technical compliance-readiness measures only. It does NOT constitute legal compliance certification. All compliance claims must be reviewed by qualified legal counsel before public launch or user data processing in regulated jurisdictions.

## GDPR Readiness

| Requirement | Current Status | Evidence | Gap | Legal Review Required |
|-------------|---------------|----------|-----|----------------------|
| **Lawful basis for processing** | Consent via Telegram login + terms acceptance | Auth flow, Terms acceptance tracking | Need explicit consent mechanism for non-essential processing | Yes |
| **Data Processing Agreement (DPA)** | Supabase DPA, Vercel DPA | Provider agreements | Need signed DPAs | Yes |
| **Data minimization** | Partial | Privacy architecture doc | Event retention (90 days) - may need shorter period for some data | Yes |
| **Purpose limitation** | Documented | Privacy data inventory | Processing purposes documented but need user-facing notice | Yes |
| **Right of access** | Data export API (planned) | Account deletion flow | Need user-friendly export portal | Yes |
| **Right to erasure** | Account deletion flow | Account deletion doc | Need verification that all copies deleted | Yes |
| **Right to rectification** | Profile editing UI | Settings pages | User can edit most profile data | Yes |
| **Right to data portability** | Data export (partial) | Planned feature | Need structured format (JSON) | Yes |
| **Right to object** | Opt-out controls | Privacy settings | Need objection mechanism for specific processing | Yes |
| **Automated decision-making** | AI moderation + recommendations | AI privacy audit | Users not informed of automated decisions affecting them | Yes |
| **Privacy notice** | Terms/Privacy doc integration (planned) | Planned | Need comprehensive privacy notice | Yes |
| **Data Protection Officer** | Not appointed | N/A | Consider DPO appointment if processing at scale | Yes |
| **Breach notification** | Incident response plan | Incident response doc | 72-hour notification process not fully documented | Yes |
| **DPIA** | Not conducted | N/A | Required for high-risk processing (dating, location) | Yes |

## CCPA / CPRA Readiness

| Requirement | Current Status | Gap | Legal Review Required |
|-------------|---------------|-----|----------------------|
| **Right to know** | Data inventory exists but not user-facing | Need CCPA-specific disclosure mechanism | Yes |
| **Right to delete** | Account deletion flow | Same as GDPR right to erasure | Yes |
| **Right to opt-out of sale** | No sale of personal data | Need explicit statement and opt-out mechanism | Yes |
| **Right to non-discrimination** | No differential treatment based on CCPA exercise | Should document | Yes |
| **Category disclosure** | Data inventory exists | Need categorized disclosure in privacy notice | Yes |
| **Minor protections (<16)** | Age gate + dating restriction | Need opt-in for minors 13-16 | Yes |

## Children's Privacy

| Requirement | Current Status | Gap | Legal Review Required |
|-------------|---------------|-----|----------------------|
| **Age gate** | Minimum age 18 for dating | No platform-wide age verification | Yes |
| **COPPA readiness** | No targeted collection from <13 | Need age screening mechanism | Yes |
| **UK Age-Appropriate Design Code** | Awareness | Need comprehensive children's privacy assessment | Yes |

## Payment Compliance

| Requirement | Current Status | Gap | Legal Review Required |
|-------------|---------------|-----|----------------------|
| **PCI DSS** | Handled by Telegram Stars (not stored) | No payment card data stored | Yes |
| **Anti-money laundering** | Basic fraud detection | Need formal AML procedures for creator payouts | Yes |
| **KYC for creators** | Basic verification | Need enhanced verification for payouts | Yes |

## Advertising Compliance

| Requirement | Current Status | Gap | Legal Review Required |
|-------------|---------------|-----|----------------------|
| **Ad disclosures** | Sponsored labels | Need consistent labeling across all placements | Yes |
| **Targeted advertising** | Interest-based targeting | Need opt-out mechanism | Yes |
| **Sensitive targeting** | No sensitive category targeting | Should document prohibition | Yes |
| **Ad policy** | Basic content moderation | Need comprehensive ad policy | Yes |

## Accessibility

| Requirement | Current Status | Gap |
|-------------|---------------|-----|
| **WCAG 2.1 AA** | Partial | Need comprehensive accessibility audit |
| **Screen reader support** | Basic semantic HTML | Need ARIA labels, keyboard navigation |
| **Color contrast** | Theme-dependent | Telegram theme colors may not meet contrast requirements |

## Platform Policy Compliance (Telegram)

| Requirement | Current Status | Gap |
|-------------|---------------|-----|
| **Mini App terms** | Followed | Need periodic review |
| **Bot API terms** | Followed | Need periodic review |
| **Payment terms** | Followed | Need periodic review |
| **Content policy** | Moderation in place | Need alignment with Telegram's content policies |

## Consumer Protection

| Requirement | Current Status | Gap |
|-------------|---------------|-----|
| **Transparent pricing** | Premium page shows prices | Need clear subscription terms |
| **Cancellation rights** | Easy cancellation flow | Need confirmation + cooling-off period notice |
| **Refund policy** | Via Telegram | Need documented refund policy |
| **Terms of Service** | Planned | Need comprehensive ToS |
