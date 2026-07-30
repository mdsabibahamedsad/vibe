import { translate } from "./engine";
import { FALLBACK_LANGUAGE } from "./types";

interface TranslationRequest {
  text: string;
  sourceLanguage?: string;
  targetLanguage: string;
}

interface TranslationResult {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  isAiGenerated: boolean;
}

const AI_TRANSLATION_ENABLED = process.env.NEXT_PUBLIC_AI_TRANSLATION_ENABLED === "true";

const TRANSLATION_PRIVACY_RULES = {
  allowForContent: true,
  allowForBios: true,
  allowForCaptions: true,
  allowForComments: true,
  allowForHelpArticles: true,
  allowForSupportTickets: true,
  allowForMessages: false,
  allowForPrivateData: false,
} as const;

export function canTranslateContentType(type: keyof typeof TRANSLATION_PRIVACY_RULES): boolean {
  return TRANSLATION_PRIVACY_RULES[type];
}

function detectLanguage(text: string): string {
  return FALLBACK_LANGUAGE;
}

export async function translateContent(
  request: TranslationRequest,
): Promise<TranslationResult> {
  if (!AI_TRANSLATION_ENABLED) {
    return {
      translatedText: request.text,
      sourceLanguage: request.sourceLanguage ?? detectLanguage(request.text),
      targetLanguage: request.targetLanguage,
      isAiGenerated: false,
    };
  }

  if (request.targetLanguage === FALLBACK_LANGUAGE) {
    return {
      translatedText: request.text,
      sourceLanguage: request.sourceLanguage ?? detectLanguage(request.text),
      targetLanguage: request.targetLanguage,
      isAiGenerated: false,
    };
  }

  try {
    const translatedText = await callTranslationService(
      request.text,
      request.targetLanguage,
    );

    return {
      translatedText,
      sourceLanguage: request.sourceLanguage ?? detectLanguage(request.text),
      targetLanguage: request.targetLanguage,
      isAiGenerated: true,
    };
  } catch {
    return {
      translatedText: request.text,
      sourceLanguage: request.sourceLanguage ?? detectLanguage(request.text),
      targetLanguage: request.targetLanguage,
      isAiGenerated: false,
    };
  }
}

async function callTranslationService(
  text: string,
  targetLanguage: string,
): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_AI_PROVIDER_KEY;
  const provider = process.env.NEXT_PUBLIC_AI_TRANSLATION_PROVIDER ?? "internal";

  if (provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Translate the following text to ${targetLanguage}. Preserve all placeholders like {actor}, {count}, {name} etc. Do not modify HTML or markdown formatting. Only return the translated text.`,
          },
          { role: "user", content: text },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) throw new Error("Translation API error");
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() ?? text;
  }

  if (provider === "internal") {
    const response = await fetch("/api/ai/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, targetLanguage }),
    });
    if (!response.ok) throw new Error("Translation API error");
    const data = await response.json();
    return data.translatedText ?? text;
  }

  return text;
}

export function getTranslationLabel(
  originalLanguage: string,
  targetLanguage: string,
): string {
  return `Translated from ${originalLanguage} to ${targetLanguage}`;
}

export async function batchTranslate(
  items: Array<{ id: string; text: string }>,
  targetLanguage: string,
): Promise<Array<{ id: string; translatedText: string }>> {
  const results = await Promise.allSettled(
    items.map((item) =>
      translateContent({
        text: item.text,
        targetLanguage,
      }).then((r) => ({
        id: item.id,
        translatedText: r.translatedText,
      })),
    ),
  );

  return results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { id: "", translatedText: "" },
  ).filter((r) => r.id);
}
