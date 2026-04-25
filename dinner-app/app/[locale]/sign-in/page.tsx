"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function SignInPage() {
  const t = useTranslations("auth");
  const [email, setEmail]     = useState("");
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { error: sbError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // After clicking the link, land on /auth/callback which exchanges the code
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);
    if (sbError) {
      setError(sbError.message);
    } else {
      setSent(true);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* App name */}
        <h1 className="mb-8 text-center text-2xl font-semibold text-zinc-900">
          🍽️ What&apos;s for dinner?
        </h1>

        {sent ? (
          <p className="rounded-xl bg-green-50 p-4 text-center text-sm text-green-800">
            {t("magicLinkSent")}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-sm font-medium text-zinc-700"
              >
                {t("emailLabel")}
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-amber-500 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-60"
            >
              {loading ? "…" : t("magicLinkButton")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
