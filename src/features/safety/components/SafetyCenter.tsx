"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";

interface SafetyArticle {
  slug: string;
  title: string;
  icon: string;
  category: string;
  content: string[];
  tips: string[];
}

const SAFETY_ARTICLES: SafetyArticle[] = [
  {
    slug: "dating-safety",
    title: "Dating Safety Tips",
    icon: "❤️",
    category: "dating",
    content: [
      "Meeting new people is exciting, but your safety always comes first.",
      "Always meet in public places for your first few dates.",
      "Tell a friend where you're going and who you're meeting.",
      "Trust your instincts — if something feels off, it probably is.",
    ],
    tips: [
      "Take things at your own pace — don't feel pressured.",
      "Video chat before meeting in person when possible.",
      "Keep your personal contact information private until you're ready.",
      "Use Vibe's built-in chat — scammers often try to move conversations to other apps.",
    ],
  },
  {
    slug: "scam-awareness",
    title: "Recognizing Scams",
    icon: "🎣",
    category: "scams",
    content: [
      "Scammers use emotional stories, fake emergencies, and promises of love to gain trust.",
      "Never send money to someone you haven't met in person.",
      "Be wary of anyone who rapidly declares strong feelings or makes grand promises.",
    ],
    tips: [
      "Never send money, gift cards, or cryptocurrency to someone you met online.",
      "Watch for excuses to avoid meeting in person or video chatting.",
      "Be suspicious of investment opportunities or 'guaranteed returns.'",
      "Report suspicious profiles — you might help protect others.",
    ],
  },
  {
    slug: "financial-safety",
    title: "Financial Safety",
    icon: "💰",
    category: "scams",
    content: [
      "Protect your financial information — never share bank details, credit cards, or payment app info.",
      "Be wary of requests for money, even for seemingly legitimate emergencies.",
      "Scammers often create elaborate stories about medical bills, travel emergencies, or legal troubles.",
    ],
    tips: [
      "Never share your bank account, credit card, or payment app information.",
      "Be skeptical of 'guaranteed' investment opportunities or cryptocurrency schemes.",
      "Report any financial requests to Vibe immediately.",
      "Remember: legitimate emergencies can be verified through family or friends.",
    ],
  },
  {
    slug: "account-security",
    title: "Account Security",
    icon: "🔐",
    category: "privacy",
    content: [
      "Your account security is important. Use a strong password and never share your login details.",
      "Enable two-factor authentication when available.",
      "Be cautious of phishing attempts — Vibe will never ask for your password.",
    ],
    tips: [
      "Never share your verification code or login credentials with anyone.",
      "Use a unique password that you don't use on other sites.",
      "Log out of shared devices and don't save passwords on public computers.",
      "Enable login alerts to know when your account is accessed.",
    ],
  },
  {
    slug: "reporting-and-blocking",
    title: "Reporting & Blocking",
    icon: "🚨",
    category: "privacy",
    content: [
      "You can report any user, message, or content that makes you uncomfortable.",
      "Blocking someone prevents them from viewing your profile, sending messages, or interacting with you.",
      "Your reports are confidential — the person you report won't know who reported them.",
    ],
    tips: [
      "Block immediately if someone makes you feel unsafe or uncomfortable.",
      "Report harassment, spam, impersonation, and suspicious behavior.",
      "You can unblock users at any time from your settings.",
      "Multiple reports help us identify and remove harmful users faster.",
    ],
  },
  {
    slug: "privacy-controls",
    title: "Privacy Controls",
    icon: "👁️",
    category: "privacy",
    content: [
      "You control who sees your profile, your activity status, and your personal information.",
      "Your exact location is never shared — only approximate distance.",
      "You can control who can message you and who can find you in discovery.",
    ],
    tips: [
      "Review your privacy settings regularly.",
      "Choose who can see your age, distance, and online status.",
      "Control who can message you — options include Everyone, Followers, Matches, or Nobody.",
      "Disable discovery when you're not actively looking for new connections.",
    ],
  },
  {
    slug: "safety-center",
    title: "General Safety Guidelines",
    icon: "🛡️",
    category: "general",
    content: [
      "Your safety is our priority. Here are essential guidelines for using Vibe safely.",
      "Trust your instincts — if something feels wrong, it probably is.",
      "Take your time getting to know someone before sharing personal information.",
    ],
    tips: [
      "Never share personal identification numbers, passwords, or financial information.",
      "Meet in public places for first meetings and tell a friend your plans.",
      "Report any suspicious behavior immediately.",
      "Remember: you're in control — you can block, report, or leave any conversation at any time.",
    ],
  },
];

const CATEGORIES = [
  { id: "all", label: "All Topics", icon: "📚" },
  { id: "dating", label: "Dating Safety", icon: "❤️" },
  { id: "scams", label: "Scam Awareness", icon: "🎣" },
  { id: "privacy", label: "Privacy & Security", icon: "🔐" },
  { id: "general", label: "General", icon: "🛡️" },
];

export function SafetyCenter() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [activeCategory, setActiveCategory] = useState("all");
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

  const filteredArticles =
    activeCategory === "all"
      ? SAFETY_ARTICLES
      : SAFETY_ARTICLES.filter((a) => a.category === activeCategory);

  return (
    <div className="flex flex-col min-h-dvh bg-[var(--tg-theme-bg-color,#ffffff)]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[var(--tg-theme-secondary-bg-color,#f0f0f0)] bg-[var(--tg-theme-bg-color,#ffffff)]/80 backdrop-blur-md">
        <div className="px-4 py-3">
          <h1 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">
            🛡️ Safety Center
          </h1>
          <p className="text-sm text-[var(--tg-theme-hint-color,#999999)] mt-0.5">
            Learn how to stay safe on Vibe
          </p>
        </div>
      </header>

      {/* Category Filter */}
      <div className="overflow-x-auto px-4 py-3 border-b border-[var(--tg-theme-secondary-bg-color,#f0f0f0)]">
        <div className="flex gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCategory(cat.id);
                setExpandedArticle(null);
              }}
              className={`flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeCategory === cat.id
                  ? "bg-[var(--tg-theme-button-color,#0088cc)] text-white"
                  : "bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] text-[var(--tg-theme-text-color,#000000)]"
              }`}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Articles */}
      <div className="flex-1 px-4 py-4 space-y-3">
        {filteredArticles.map((article) => (
          <div
            key={article.slug}
            className="rounded-xl border border-[var(--tg-theme-secondary-bg-color,#f0f0f0)] overflow-hidden"
          >
            <button
              onClick={() =>
                setExpandedArticle(
                  expandedArticle === article.slug ? null : article.slug,
                )
              }
              className="w-full flex items-center justify-between p-4 text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{article.icon}</span>
                <div>
                  <h3 className="font-semibold text-[var(--tg-theme-text-color,#000000)]">
                    {article.title}
                  </h3>
                  <p className="text-xs text-[var(--tg-theme-hint-color,#999999)] capitalize">
                    {article.category}
                  </p>
                </div>
              </div>
              <svg
                className={`w-5 h-5 text-[var(--tg-theme-hint-color,#999999)] transition-transform ${
                  expandedArticle === article.slug ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {expandedArticle === article.slug && (
              <div className="px-4 pb-4 space-y-3">
                <div className="space-y-2">
                  {article.content.map((paragraph, i) => (
                    <p
                      key={i}
                      className="text-sm text-[var(--tg-theme-text-color,#000000)] leading-relaxed"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>

                <div className="rounded-lg bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] p-3">
                  <h4 className="text-sm font-semibold text-[var(--tg-theme-text-color,#000000)] mb-2">
                    💡 Tips
                  </h4>
                  <ul className="space-y-1.5">
                    {article.tips.map((tip, i) => (
                      <li
                        key={i}
                        className="text-sm text-[var(--tg-theme-text-color,#000000)] pl-4 relative"
                      >
                        <span className="absolute left-0 top-0">•</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Quick actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => router.push("/settings/privacy")}
                    className="flex-1 rounded-lg bg-[var(--tg-theme-button-color,#0088cc)] px-3 py-2 text-sm font-medium text-white text-center"
                  >
                    Update Privacy
                  </button>
                  <button
                    onClick={() => router.push("/settings/help")}
                    className="flex-1 rounded-lg border border-[var(--tg-theme-button-color,#0088cc)] px-3 py-2 text-sm font-medium text-[var(--tg-theme-button-color,#0088cc)] text-center"
                  >
                    Get Help
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Emergency */}
      <div className="px-4 py-4 border-t border-[var(--tg-theme-secondary-bg-color,#f0f0f0)]">
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-4">
          <h3 className="font-semibold text-red-800 dark:text-red-300">
            🆘 Emergency Situation?
          </h3>
          <p className="text-sm text-red-700 dark:text-red-400 mt-1">
            If you are in immediate danger or need urgent help, please contact your local
            emergency services. Vibe safety resources are educational tools, not a substitute
            for professional help.
          </p>
        </div>
      </div>
    </div>
  );
}
