#!/usr/bin/env node
/**
 * One-off: add the new UI keys introduced by the redesign to every locale.
 * Only touches navigation.json, search.json, dating.json, chat.json.
 * Keys not yet translated fall back to English automatically at runtime,
 * but we provide real translations for the locales we can.
 *
 * Run: node scripts/add-ui-i18n-keys.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRANSLATIONS_DIR = join(__dirname, "..", "src", "lib", "i18n", "translations");

const LOCALES = ["en", "bn", "hi", "ar", "es", "pt", "id", "tr", "fr"];

/** new keys per namespace -> { locale: value } (en = source of truth) */
const ADDITIONS = {
  navigation: {
    key: "home",
    values: {
      en: { tagline1: "Your world.", tagline2: "Your people.", tagline3: "Your vibe." },
      bn: { tagline1: "তোমার জগৎ।", tagline2: "তোমার মানুষ।", tagline3: "তোমার ভাইব।" },
      hi: { tagline1: "आपकी दुनिया।", tagline2: "आपके लोग।", tagline3: "आपका वाइब।" },
      ar: { tagline1: "عالمك.", tagline2: "أ.peopleك.", tagline3: "مزاجك." },
      es: { tagline1: "Tu mundo.", tagline2: "Tu gente.", tagline3: "Tu rollo." },
      pt: { tagline1: "O seu mundo.", tagline2: "A sua gente.", tagline3: "O seu vibe." },
      id: { tagline1: "Duniamu.", tagline2: "Orang-orangmu.", tagline3: "Vibemu." },
      tr: { tagline1: "Senin dünyan.", tagline2: "Senin insanların.", tagline3: "Senin vibin." },
      fr: { tagline1: "Ton monde.", tagline2: "Ta bande.", tagline3: "Ton flow." },
    },
  },
  search: {
    key: null, // flat
    values: {
      en: { discoverTitle: "Discover", signInToDiscover: "Sign in to discover people", discoverSubtitle: "Find people who share your interests", datingCardTitle: "Dating", datingCardSubtitle: "Swipe, match and meet new people" },
      bn: { discoverTitle: "খুঁজুন", signInToDiscover: "মানুষ খুঁজতে সাইন ইন করুন", discoverSubtitle: "আপনার আগ্রহের মানুষ খুঁজুন", datingCardTitle: "ডেটিং", datingCardSubtitle: "সোয়াইপ করুন, ম্যাচ করুন, নতুন মানুষের সাথে দেখা করুন" },
      hi: { discoverTitle: "खोजें", signInToDiscover: "लोगों को खोजने के लिए साइन इन करें", discoverSubtitle: "अपनी रुचियों के लोग खोजें", datingCardTitle: "डेटिंग", datingCardSubtitle: "स्वाइप करें, मैच करें, नए लोगों से मिलें" },
      ar: { discoverTitle: "استكشاف", signInToDiscover: "سجّل الدخول لاكتشاف أشخاص", discoverSubtitle: "اعثر على أشخاص يشاركونك اهتماماتك", datingCardTitle: "المواعدة", datingCardSubtitle: "اسحب، وطابق، وتعرّف على أشخاص جدد" },
      es: { discoverTitle: "Descubrir", signInToDiscover: "Inicia sesión para descubrir gente", discoverSubtitle: "Encuentra gente con tus intereses", datingCardTitle: "Citas", datingCardSubtitle: "Desliza, haz match y conoce gente nueva" },
      pt: { discoverTitle: "Descobrir", signInToDiscover: "Entre para descobrir pessoas", discoverSubtitle: "Encontre pessoas com os seus interesses", datingCardTitle: "Namoro", datingCardSubtitle: "Deslize, faça match e conheça pessoas novas" },
      id: { discoverTitle: "Jelajah", signInToDiscover: "Masuk untuk menemukan orang", discoverSubtitle: "Temukan orang dengan minat yang sama", datingCardTitle: "Pacaran", datingCardSubtitle: "Geser, cocokkan, dan kenali orang baru" },
      tr: { discoverTitle: "Keşfet", signInToDiscover: "İnsanları keşfetmek için giriş yap", discoverSubtitle: "İlgi alanların aynı olan insanları bul", datingCardTitle: "Flört", datingCardSubtitle: "Kaydır, eşleş ve yeni insanlarla tanış" },
      fr: { discoverTitle: "Découvrir", signInToDiscover: "Connecte-toi pour découvrir des gens", discoverSubtitle: "Trouve des gens qui partagent tes centres d'intérêt", datingCardTitle: "Rencontres", datingCardSubtitle: "Swipe, matche et rencontre de nouvelles personnes" },
    },
  },
  dating: {
    key: null, // flat
    values: {
      en: { matchesTitle: "Matches", matchesErrorTitle: "Failed to load matches", matchesEmptyTitle: "No matches yet", matchesEmptyDescription: "Keep discovering people who share your interests. When you both like each other, you'll match here.", matchesDiscoverCta: "Discover People", matchCount: "{count} match{count-plural}" },
      bn: { matchesTitle: "ম্যাচ", matchesErrorTitle: "ম্যাচ লোড করতে ব্যর্থ", matchesEmptyTitle: "এখনো কোনো ম্যাচ নেই", matchesEmptyDescription: "আপনার আগ্রহের মানুষ খুঁজতে থাকুন। দুজনে পছন্দ করলে এখানে ম্যাচ হবে।", matchesDiscoverCta: "মানুষ খুঁজুন", matchCount: "{count} ম্যাচ" },
      hi: { matchesTitle: "मैच", matchesErrorTitle: "मैच लोड करने में विफल", matchesEmptyTitle: "अभी कोई मैच नहीं", matchesEmptyDescription: "अपनी रुचियों के लोगों को खोजते रहें। जब दोनों पसंद करेंगे, तब मैच यहाँ दिखेगा।", matchesDiscoverCta: "लोग खोजें", matchCount: "{count} मैच" },
      ar: { matchesTitle: "التطابقات", matchesErrorTitle: "فشل تحميل التطابقات", matchesEmptyTitle: "لا توجد تطابقات بعد", matchesEmptyDescription: "واصل اكتشاف أشخاص يشاركونك اهتماماتك. عند الإعجاب المتبادل ستظهر التطابقات هنا.", matchesDiscoverCta: "اكتشف أشخاصًا", matchCount: "{count} تطابق" },
      es: { matchesTitle: "Matches", matchesErrorTitle: "No se pudieron cargar los matches", matchesEmptyTitle: "Aún no hay matches", matchesEmptyDescription: "Sigue descubriendo gente con tus intereses. Cuando os gustéis mutuamente, aparecerá aquí.", matchesDiscoverCta: "Descubrir gente", matchCount: "{count} match" },
      pt: { matchesTitle: "Matches", matchesErrorTitle: "Não foi possível carregar os matches", matchesEmptyTitle: "Ainda sem matches", matchesEmptyDescription: "Continua a descobrir pessoas com os teus interesses. Quando gostarem um do outro, aparece aqui.", matchesDiscoverCta: "Descobrir pessoas", matchCount: "{count} match" },
      id: { matchesTitle: "Cocok", matchesErrorTitle: "Gagal memuat kecocokan", matchesEmptyTitle: "Belum ada yang cocok", matchesEmptyDescription: "Terus temukan orang dengan minatmu. Kalau sama-sama suka, akan muncul di sini.", matchesDiscoverCta: "Temukan orang", matchCount: "{count} kecocokan" },
      tr: { matchesTitle: "Eşleşmeler", matchesErrorTitle: "Eşleşmeler yüklenemedi", matchesEmptyTitle: "Henüz eşleşme yok", matchesEmptyDescription: "İlgi alanların aynı olan insanları keşfetmeye devam et. Karşılıklı beğenide eşleşme burada görünür.", matchesDiscoverCta: "İnsanları keşfet", matchCount: "{count} eşleşme" },
      fr: { matchesTitle: "Matchs", matchesErrorTitle: "Impossible de charger les matchs", matchesEmptyTitle: "Pas encore de match", matchesEmptyDescription: "Continue de découvrir des gens qui partagent tes goûts. Quand ça se réciproque, le match apparaît ici.", matchesDiscoverCta: "Découvrir des gens", matchCount: "{count} match" },
    },
  },
  chat: {
    key: null, // flat
    values: {
      en: { emptyTitle: "No messages yet", emptyDescription: "Match with someone to start chatting!", discoverPeople: "Discover People", conversationCount: "{count} conversation{count-plural}" },
      bn: { emptyTitle: "এখনো কোনো বার্তা নেই", emptyDescription: "কারো সাথে ম্যাচ হয়ে চ্যাট শুরু করুন!", discoverPeople: "মানুষ খুঁজুন", conversationCount: "{count} কথোপকথন" },
      hi: { emptyTitle: "अभी कोई संदेश नहीं", emptyDescription: "किसी से मैच करके चैट शुरू करें!", discoverPeople: "लोग खोजें", conversationCount: "{count} बातचीत" },
      ar: { emptyTitle: "لا توجد رسائل بعد", emptyDescription: "طابق مع شخص لتبدأ المحادثة!", discoverPeople: "اكتشف أشخاصًا", conversationCount: "{count} محادثة" },
      es: { emptyTitle: "Aún no hay mensajes", emptyDescription: "¡Haz match con alguien para empezar a chatear!", discoverPeople: "Descubrir gente", conversationCount: "{count} conversación" },
      pt: { emptyTitle: "Ainda sem mensagens", emptyDescription: "Faz match com alguém para começar a conversar!", discoverPeople: "Descobrir pessoas", conversationCount: "{count} conversa" },
      id: { emptyTitle: "Belum ada pesan", emptyDescription: "Cocokkan dengan seseorang untuk mulai mengobrol!", discoverPeople: "Temukan orang", conversationCount: "{count} percakapan" },
      tr: { emptyTitle: "Henüz mesaj yok", emptyDescription: "Sohbete başlamak için biriyle eşleş!", discoverPeople: "İnsanları keşfet", conversationCount: "{count} sohbet" },
      fr: { emptyTitle: "Pas encore de messages", emptyDescription: "Matche avec quelqu'un pour commencer à discuter !", discoverPeople: "Découvrir des gens", conversationCount: "{count} conversation" },
    },
  },
};

function pluralize(template, locale) {
  // {count-plural} — simple english-style plural; most locales above omit it.
  return template.includes("{count-plural}") ? template : template;
}

function applyToNamespace(locale, ns, addition) {
  const filePath = join(TRANSLATIONS_DIR, locale, `${ns}.json`);
  let data;
  try {
    data = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    console.warn(`  ! missing file ${locale}/${ns}.json, skipping`);
    return;
  }

  const values = addition.values[locale] ?? addition.values.en;
  let added = 0;

  if (addition.key) {
    if (!data[addition.key]) data[addition.key] = {};
    for (const [k, v] of Object.entries(values)) {
      if (!(k in data[addition.key])) {
        data[addition.key][k] = v;
        added++;
      }
    }
  } else {
    for (const [k, v] of Object.entries(values)) {
      if (!(k in data)) {
        data[k] = v;
        added++;
      }
    }
  }

  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
  if (added > 0) console.log(`  + ${locale}/${ns}.json: ${added} keys`);
}

console.log("Adding redesign UI keys...");
for (const [ns, addition] of Object.entries(ADDITIONS)) {
  console.log(ns);
  for (const locale of LOCALES) {
    applyToNamespace(locale, ns, addition);
  }
}

// Fix plural template usage: engine interpolates {count}; simplify matchCount/conversationCount
console.log("Normalizing plural templates...");
for (const locale of LOCALES) {
  const datingPath = join(TRANSLATIONS_DIR, locale, "dating.json");
  const chatPath = join(TRANSLATIONS_DIR, locale, "chat.json");
  try {
    const dating = JSON.parse(readFileSync(datingPath, "utf8"));
    if (dating.matchCount) dating.matchCount = dating.matchCount.replace(/\{count-plural\}/g, "s");
    writeFileSync(datingPath, JSON.stringify(dating, null, 2) + "\n");
  } catch { /* skip */ }
  try {
    const chat = JSON.parse(readFileSync(chatPath, "utf8"));
    if (chat.conversationCount) chat.conversationCount = chat.conversationCount.replace(/\{count-plural\}/g, "s");
    writeFileSync(chatPath, JSON.stringify(chat, null, 2) + "\n");
  } catch { /* skip */ }
}

console.log("Done. Regenerate the i18n registry if your workflow requires it.");
