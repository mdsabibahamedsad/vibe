# Translations

## Translation Files

Translations are stored as JSON files in `src/lib/i18n/translations/{language}/{namespace}.json`.

### Structure

```json
{
  "key": "Translated value",
  "nested": {
    "key": "Nested translated value"
  },
  "withParams": "Hello {name}, you have {count} items"
}
```

### Placeholders

Use `{placeholder}` syntax for dynamic values:
- `{actor}` - User display name
- `{count}` - Numeric count
- `{name}` - Any name
- `{date}` - Date string
- `{amount}` - Currency amount

## Adding a New Language

1. Create directory `src/lib/i18n/translations/{code}/`
2. Create JSON files matching English namespace structure
3. Add language entry to `SUPPORTED_LANGUAGES` in `src/lib/i18n/types.ts`
4. Add plural rules for the language
5. Add language flag to `LanguageSelector` component
6. Add regional configuration if needed

## Admin Translation Manager

Available at `/admin/translations` for authorized admins.

Features:
- Browse translations by language and namespace
- Search translation keys
- Edit translation values
- Publish/unpublish translations
- Validate translations for structural issues
- Track version history

## Validation Rules

The system validates:
- Missing keys (compared to English source)
- Duplicate keys
- Invalid placeholders
- Unexpected HTML/Markdown
- Excessively long translations (>500 chars)

## AI Translation

Optional AI-powered translation via `src/lib/i18n/ai-translation.ts`.

Privacy controls:
- Content captions: Allowed
- User bios: Allowed  
- Comments: Allowed
- Help articles: Allowed
- Support tickets: Allowed
- Private messages: NOT allowed
- Private data: NOT allowed

Configuration:
- `NEXT_PUBLIC_AI_TRANSLATION_ENABLED` - Enable/disable
- `NEXT_PUBLIC_AI_TRANSLATION_PROVIDER` - Provider (internal/openai)
- `NEXT_PUBLIC_AI_PROVIDER_KEY` - API key for external provider
