# Localization (l10n)

## Date & Time

- All dates stored in UTC in the database
- Display uses `Intl.DateTimeFormat` with user's locale
- Relative timestamps use `Intl.RelativeTimeFormat`
- Age calculations use canonical date-of-birth, never localized strings
- Timezone is detected from browser/Telegram or configurable

## Number Formatting

- View counts, followers, likes use `Intl.NumberFormat`
- Compact format (1.5K, 2.5M) for large numbers
- Percentages use `Intl.NumberFormat` with percent style
- All formatting is display-only; no formatted numbers stored in DB

## Currency

- Primary currency: Telegram Stars (XTR)
- Display format: `⭐ {amount}` with locale-aware number formatting
- No client-side financial calculations
- Currency abstraction supports future fiat currencies without changing payment logic
- Display currency may differ from settlement currency

## Distance Units

- Canonical storage: kilometers in database
- Display: km or mi based on regional configuration
- Conversion: mi = km × 0.621371

## Formatters

Available in `src/lib/i18n/formatters.ts`:

| Function | Purpose |
|----------|---------|
| formatDate | Locale-aware date formatting |
| formatTime | Locale-aware time formatting |
| formatDateTime | Locale-aware date+time formatting |
| formatRelativeTime | "2 hours ago" style formatting |
| formatNumber | Locale-aware number formatting |
| formatCurrency | Currency display (Stars or fiat) |
| formatPercentage | Percentage display |
| formatDistance | Distance display (km/mi) |
| formatCompactNumber | Compact number display (1.5K) |
| formatAge | Age calculation from DOB |

## Regional Configuration

Defined in `src/lib/i18n/regional-config.ts`.

Each region specifies:
- Languages
- Currency
- Distance unit
- Date/time format
- First day of week
- Feature flags
- Compliance requirements

Available regions: DEFAULT, EU, US, IN, BR, TR, ID, SA
