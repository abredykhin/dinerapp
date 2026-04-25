"use client";

import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const LOCALES = ["en", "ru", "uk"] as const;

export default function Header() {
  const t      = useTranslations();
  const locale = useLocale();
  const router = useRouter();

  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut();
    router.push("/sign-in");
  }

  function changeLocale(next: string) {
    // Replace locale segment and reload — simplest approach for this scale
    const url = window.location.pathname.replace(/^\/(en|ru|uk)/, `/${next}`);
    window.location.href = url + window.location.search;
  }

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-zinc-100 bg-white/90 px-4 py-3 backdrop-blur-sm">
      <span className="text-lg font-semibold text-zinc-900">🍽️</span>

      <div className="flex items-center gap-2">
        {/* Locale switcher */}
        <select
          value={locale}
          onChange={(e) => changeLocale(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-700 outline-none focus:border-amber-400"
          aria-label="Language"
        >
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {t(`locale.${l}`)}
            </option>
          ))}
        </select>

        {/* Sign-out */}
        <button
          onClick={signOut}
          className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
        >
          {t("auth.signOut")}
        </button>
      </div>
    </header>
  );
}
