"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

interface Recipe {
  id: string;
  title: string;
  summary: string | null;
  source_type: "ai" | "scraped";
  source_url: string | null;
  full_ingredients: Array<{ text: string; is_core?: boolean; emoji?: string; color?: string }>;
  instructions: Array<{ step: number; text: string }>;
  hero_image_path: string | null;
  revision_count: number;
  locale: string;
}

/** Returns true if the ingredient text contains any of the core terms. Used as fallback for older recipes without is_core. */
function isCore(text: string, coreTerms: string[]): boolean {
  const lower = text.toLowerCase();
  return coreTerms.some((term) => lower.includes(term));
}

const colorMap: Record<string, string> = {
  red: "bg-red-100 text-red-700",
  orange: "bg-orange-100 text-orange-700",
  amber: "bg-amber-100 text-amber-700",
  yellow: "bg-yellow-100 text-yellow-700",
  lime: "bg-lime-100 text-lime-700",
  green: "bg-green-100 text-green-700",
  emerald: "bg-emerald-100 text-emerald-700",
  teal: "bg-teal-100 text-teal-700",
  cyan: "bg-cyan-100 text-cyan-700",
  sky: "bg-sky-100 text-sky-700",
  blue: "bg-blue-100 text-blue-700",
  indigo: "bg-indigo-100 text-indigo-700",
  violet: "bg-violet-100 text-violet-700",
  purple: "bg-purple-100 text-purple-700",
  fuchsia: "bg-fuchsia-100 text-fuchsia-700",
  pink: "bg-pink-100 text-pink-700",
  rose: "bg-rose-100 text-rose-700",
  slate: "bg-slate-100 text-slate-700",
};

export default function RecipeDetailView({
  recipe: initial,
  heroUrl: initialHeroUrl,
  coreTerms,
}: {
  recipe: Recipe;
  heroUrl: string | null;
  coreTerms: string[];
}) {
  const t      = useTranslations();
  const router = useRouter();

  const [recipe, setRecipe]                     = useState(initial);
  const [heroUrl, setHeroUrl]                   = useState(initialHeroUrl);
  const [editing, setEditing]                   = useState(false);
  const [editTitle, setEditTitle]               = useState(initial.title);
  const [editSummary, setEditSummary]           = useState(initial.summary ?? "");
  const [editIngredients, setEditIngredients]   = useState<{ text: string; is_core?: boolean; emoji?: string; color?: string }[]>(
    initial.full_ingredients,
  );
  const [editInstructions, setEditInstructions] = useState<string[]>(
    initial.instructions.map((s) => s.text),
  );
  const [saving, setSaving]                     = useState(false);
  const [confirmDelete, setConfirmDelete]       = useState(false);
  const [deleting, setDeleting]                 = useState(false);
  const [regenImg, setRegenImg]                 = useState(false);
  const [error, setError]                       = useState<string | null>(null);

  // ── Enter edit mode ────────────────────────────────────────────────────────
  function startEditing() {
    setEditTitle(recipe.title);
    setEditSummary(recipe.summary ?? "");
    setEditIngredients(recipe.full_ingredients);
    setEditInstructions(recipe.instructions.map((s) => s.text));
    setEditing(true);
  }

  // ── Save inline edits ──────────────────────────────────────────────────────
  async function saveEdits() {
    setSaving(true);
    setError(null);
    const sb = getSupabaseBrowserClient();

    const newIngredients = editIngredients
      .map((v) => ({ text: v.text.trim(), is_core: v.is_core, emoji: v.emoji, color: v.color }))
      .filter((v) => v.text);

    const newInstructions = editInstructions
      .map((v, i) => ({ step: i + 1, text: v.trim() }))
      .filter((s) => s.text);

    const { error: sbErr } = await sb
      .from("recipes")
      .update({
        title:            editTitle,
        summary:          editSummary || null,
        full_ingredients: newIngredients,
        instructions:     newInstructions,
      })
      .eq("id", recipe.id);

    setSaving(false);
    if (sbErr) { setError(sbErr.message); return; }
    setRecipe((r) => ({
      ...r,
      title:            editTitle,
      summary:          editSummary || null,
      full_ingredients: newIngredients,
      instructions:     newInstructions,
    }));
    setEditing(false);
  }

  // ── Ingredient helpers ─────────────────────────────────────────────────────
  function updateIngredient(i: number, val: string) {
    setEditIngredients((prev) => prev.map((v, idx) => idx === i ? { ...v, text: val } : v));
  }
  function toggleIngredientCore(i: number) {
    setEditIngredients((prev) => prev.map((v, idx) => idx === i ? { ...v, is_core: !v.is_core } : v));
  }
  function removeIngredient(i: number) {
    setEditIngredients((prev) => prev.filter((_, idx) => idx !== i));
  }

  // ── Instruction helpers ────────────────────────────────────────────────────
  function updateInstruction(i: number, val: string) {
    setEditInstructions((prev) => prev.map((v, idx) => idx === i ? val : v));
  }
  function removeInstruction(i: number) {
    setEditInstructions((prev) => prev.filter((_, idx) => idx !== i));
  }

  // ── Soft delete ────────────────────────────────────────────────────────────
  async function deleteRecipe() {
    setDeleting(true);
    const sb = getSupabaseBrowserClient();
    await sb
      .from("recipes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", recipe.id);
    router.push("/library");
    router.refresh();
  }

  // ── Regenerate image ───────────────────────────────────────────────────────
  async function regenerateImage() {
    setRegenImg(true);
    setError(null);
    const sb = getSupabaseBrowserClient();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { setRegenImg(false); return; }

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-recipe`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ kind: "regenerate-image", recipe_id: recipe.id }),
      },
    );
    const json = await res.json();
    setRegenImg(false);
    if (!res.ok) { setError(json.error ?? t("errors.generic")); return; }
    setHeroUrl(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-images/${json.hero_image_path}?t=${Date.now()}`,
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      {/* Hero image */}
      <div className="relative -mx-4 aspect-square w-[calc(100%+2rem)] overflow-hidden bg-zinc-100">
        {heroUrl ? (
          <Image src={heroUrl} alt={recipe.title} fill className="object-cover" priority sizes="(max-width: 640px) 100vw, 640px" />
        ) : (
          <div className="flex h-full items-center justify-center text-5xl">🍳</div>
        )}
        <button
          onClick={regenerateImage}
          disabled={regenImg}
          className="absolute bottom-3 right-3 rounded-xl bg-black/50 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-black/70 disabled:opacity-60"
        >
          {regenImg ? t("recipeDetail.regeneratingImage") : t("recipeDetail.regenerateImageButton")}
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {editing ? (
        /* ─── Edit mode ──────────────────────────────────────────────────────── */
        <div className="flex flex-col gap-5">
          {/* Title */}
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-lg font-semibold text-zinc-900 outline-none focus:border-amber-400"
          />

          {/* Summary */}
          <textarea
            value={editSummary}
            onChange={(e) => setEditSummary(e.target.value)}
            rows={2}
            placeholder={t("recipeDetail.summaryPlaceholder")}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 outline-none focus:border-amber-400"
          />

          {/* Ingredients */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-zinc-900">{t("recipeDetail.ingredients")}</h2>
            <div className="flex flex-col gap-2">
              {editIngredients.map((val, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button
                    onClick={() => toggleIngredientCore(i)}
                    className={`shrink-0 flex items-center justify-center size-8 rounded-full border transition ${
                      val.is_core
                        ? "border-amber-300 bg-amber-50 text-amber-500"
                        : "border-zinc-200 bg-zinc-50 text-zinc-300 hover:text-zinc-400"
                    }`}
                    title={val.is_core ? "Core ingredient" : "Mark as core ingredient"}
                  >
                    {val.is_core ? "⭐" : "☆"}
                  </button>
                  <input
                    value={val.text}
                    onChange={(e) => updateIngredient(i, e.target.value)}
                    className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-400"
                  />
                  <button
                    onClick={() => removeIngredient(i)}
                    className="shrink-0 text-zinc-400 hover:text-red-400"
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => setEditIngredients((p) => [...p, { text: "", is_core: false }])}
                className="self-start rounded-xl border border-dashed border-zinc-300 px-3 py-1.5 text-sm text-zinc-500 hover:border-amber-400 hover:text-amber-600"
              >
                + {t("recipeDetail.addIngredient")}
              </button>
            </div>
          </section>

          {/* Instructions */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-zinc-900">{t("recipeDetail.instructions")}</h2>
            <div className="flex flex-col gap-2">
              {editInstructions.map((val, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
                    {i + 1}
                  </span>
                  <textarea
                    value={val}
                    onChange={(e) => updateInstruction(i, e.target.value)}
                    rows={2}
                    className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-400"
                  />
                  <button
                    onClick={() => removeInstruction(i)}
                    className="mt-2 shrink-0 text-zinc-400 hover:text-red-400"
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => setEditInstructions((p) => [...p, ""])}
                className="self-start rounded-xl border border-dashed border-zinc-300 px-3 py-1.5 text-sm text-zinc-500 hover:border-amber-400 hover:text-amber-600"
              >
                + {t("recipeDetail.addStep")}
              </button>
            </div>
          </section>

          {/* Save / Cancel */}
          <div className="flex gap-2">
            <button
              onClick={saveEdits}
              disabled={saving}
              className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? t("recipeEdit.saving") : t("recipeEdit.saveButton")}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-600"
            >
              {t("recipeDetail.cancel")}
            </button>
          </div>
        </div>
      ) : (
        /* ─── View mode ──────────────────────────────────────────────────────── */
        <>
          {/* Title + summary */}
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">{recipe.title}</h1>
            {recipe.summary && (
              <p className="mt-1 text-sm text-zinc-500">{recipe.summary}</p>
            )}
          </div>

          {/* Edit button — prominent, always visible */}
          <button
            onClick={startEditing}
            className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            ✏️ {t("recipeDetail.editButton")}
          </button>

          {/* Ingredients — split view */}
          <section>
            <h2 className="mb-3 text-base font-semibold text-zinc-900">
              {t("recipeDetail.ingredients")}
            </h2>
            
            {/* Core Ingredients */}
            <div className="flex flex-col gap-3 mb-6">
              {recipe.full_ingredients.filter(ing => ing.is_core ?? isCore(ing.text, coreTerms)).map((ing, i) => {
                const colorClass = colorMap[ing.color || "amber"] || colorMap.amber;
                return (
                  <div key={i} className="flex items-center gap-3">
                    {ing.emoji ? (
                      <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${colorClass} text-sm`}>
                        {ing.emoji}
                      </div>
                    ) : (
                      <div className="flex w-8 shrink-0 items-center justify-center">
                        <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                      </div>
                    )}
                    <span className="text-base font-medium text-zinc-800">{ing.text}</span>
                  </div>
                );
              })}
            </div>

            {/* Pantry Staples */}
            {recipe.full_ingredients.filter(ing => !(ing.is_core ?? isCore(ing.text, coreTerms))).length > 0 && (
              <>
                <h3 className="mb-2 mt-4 text-sm font-medium text-zinc-500 uppercase tracking-wider">
                  {t("recipeDetail.pantryStaples") ?? "Pantry Staples"}
                </h3>
                <div className="flex flex-col gap-2">
                  {recipe.full_ingredients.filter(ing => !(ing.is_core ?? isCore(ing.text, coreTerms))).map((ing, i) => {
                    const colorClass = colorMap[ing.color || "slate"] || colorMap.slate;
                    return (
                      <div key={i} className="flex items-center gap-3 opacity-80">
                        {ing.emoji ? (
                          <div className={`flex size-6 shrink-0 items-center justify-center rounded-full ${colorClass} text-xs`}>
                            {ing.emoji}
                          </div>
                        ) : (
                          <div className="flex w-6 shrink-0 items-center justify-center">
                            <div className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
                          </div>
                        )}
                        <span className="text-sm text-zinc-600">{ing.text}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          {/* Instructions */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-zinc-900">
              {t("recipeDetail.instructions")}
            </h2>
            <ol className="flex flex-col gap-3">
              {recipe.instructions.map((step) => (
                <li key={step.step} className="flex gap-3 text-sm text-zinc-700">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
                    {step.step}
                  </span>
                  <span className="pt-0.5 leading-relaxed">{step.text}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* Source link */}
          {recipe.source_url && (
            <p className="text-xs text-zinc-400">
              {t("recipeDetail.source")}:{" "}
              <a href={recipe.source_url} target="_blank" rel="noopener noreferrer"
                className="underline hover:text-zinc-600">
                {recipe.source_url}
              </a>
            </p>
          )}

          {/* Delete button */}
          <div className="pt-2">
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full rounded-xl border border-red-100 py-2.5 text-sm font-medium text-red-500 transition hover:bg-red-50"
            >
              {t("recipeDetail.deleteButton")}
            </button>
          </div>
        </>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-8">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6">
            <p className="font-semibold text-zinc-900">{t("recipeDetail.confirmDelete")}</p>
            <p className="mt-1 text-sm text-zinc-500">{t("recipeDetail.confirmDeleteBody")}</p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-600"
              >
                {t("recipeDetail.cancel")}
              </button>
              <button
                onClick={deleteRecipe}
                disabled={deleting}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {t("recipeDetail.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
