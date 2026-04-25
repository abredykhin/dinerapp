"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Candidate {
  title: string;
  summary: string;
  core_ingredient_slugs: string[];
}

interface Recipe {
  id: string;
  title: string;
  summary: string | null;
  full_ingredients: Array<{ text: string; is_core?: boolean; emoji?: string; color?: string }>;
  instructions: Array<{ step: number; text: string }>;
  hero_image_path: string | null;
}

/**
 * The hero image is generated asynchronously after the recipe text is returned,
 * so we explicitly model its three possible states. `pending` = still generating,
 * `loaded` = the URL is ready to render, `failed` = gen errored out (show a
 * fallback so the spinner doesn't spin forever).
 */
type ImageState =
  | { kind: "pending" }
  | { kind: "loaded"; url: string }
  | { kind: "failed" };

type Step =
  | { kind: "form" }
  | { kind: "generating" }
  | { kind: "disambiguate"; draftId: string; candidates: Candidate[] }
  | { kind: "expanding" }
  | {
      kind: "review";
      recipe: Recipe;
      image: ImageState;
      regenerating: boolean;
      /** Bumped every time the recipe is replaced via regenerate; used as a
       *  React key so inline-edit state resets cleanly on new content. */
      version: number;
    };

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function callAiRecipe(body: Record<string, unknown>, accessToken: string) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-recipe`;
  console.log("[ai-recipe] →", body.kind, url);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  console.log("[ai-recipe] ←", res.status, text.slice(0, 500));

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) throw new Error((json.error as string) ?? `HTTP ${res.status}`);
  return json;
}

/** Build a public URL for a recipe image with a cache-buster so a regenerated
 *  image isn't masked by Next's (or the browser's) cache. */
function buildPublicImageUrl(path: string): string {
  const sb = getSupabaseBrowserClient();
  const base = sb.storage.from("recipe-images").getPublicUrl(path).data.publicUrl;
  return `${base}?t=${Date.now()}`;
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddPage() {
  const t = useTranslations();
  const locale = useLocale();

  const [step, setStep] = useState<Step>({ kind: "form" });
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Monotonic token for background image-gen calls. Each new call bumps it;
  // when a response arrives we ignore it if it doesn't match — prevents a
  // slow earlier call from overwriting a fresher image (or leaking onto a
  // later recipe).
  const imageGenToken = useRef(0);

  async function getToken() {
    const sb = getSupabaseBrowserClient();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error("Not signed in");
    return session.access_token;
  }

  async function fetchRecipe(recipeId: string): Promise<Recipe> {
    const sb = getSupabaseBrowserClient();
    const { data, error: sbErr } = await sb
      .from("recipes")
      .select("id, title, summary, full_ingredients, instructions, hero_image_path")
      .eq("id", recipeId)
      .single();
    if (sbErr || !data) throw new Error("Could not load recipe");
    return data as Recipe;
  }

  /**
   * Fire-and-forget: kick off image generation without awaiting. The recipe
   * view renders immediately; when (or if) the image arrives, we patch the
   * ImageState into the existing review step.
   *
   * NOTE: callers must NOT await this function — it returns synchronously
   * after scheduling the work.
   */
  function generateImageInBackground(recipeId: string, token: string) {
    const callId = ++imageGenToken.current;
    void (async () => {
      try {
        const result = await callAiRecipe(
          { kind: "regenerate-image", recipe_id: recipeId },
          token,
        );
        if (callId !== imageGenToken.current) return; // superseded
        const url = buildPublicImageUrl(result.hero_image_path as string);
        setStep((s) =>
          s.kind === "review" && s.recipe.id === recipeId
            ? { ...s, image: { kind: "loaded", url } }
            : s,
        );
      } catch (e) {
        console.warn("[ai-recipe] background image gen failed:", e);
        if (callId !== imageGenToken.current) return; // superseded
        setStep((s) =>
          s.kind === "review" && s.recipe.id === recipeId
            ? { ...s, image: { kind: "failed" } }
            : s,
        );
      }
    })();
  }

  // ── Submit dish name ────────────────────────────────────────────────────────
  async function submitPrompt(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setError(null);
    setStep({ kind: "generating" });

    try {
      const token = await getToken();
      const result = await callAiRecipe(
        { kind: "author", prompt, locale, skip_image: true },
        token,
      );

      if (result.ambiguous) {
        setStep({
          kind: "disambiguate",
          draftId: result.draft_id as string,
          candidates: result.candidates as Candidate[],
        });
      } else {
        const recipe = await fetchRecipe(result.recipe_id as string);
        // Render review FIRST, then fire image gen. Order matters: the
        // user should see the recipe before we even touch the image pipeline.
        setStep({
          kind: "review",
          recipe,
          image: { kind: "pending" },
          regenerating: false,
          version: 0,
        });
        generateImageInBackground(result.recipe_id as string, token);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
      setStep({ kind: "form" });
    }
  }

  // ── Pick a disambiguation candidate ────────────────────────────────────────
  async function pickCandidate(draftId: string, index: number) {
    setError(null);
    setStep({ kind: "expanding" });

    try {
      const token = await getToken();
      const result = await callAiRecipe(
        { kind: "author", draft_id: draftId, chosen_index: index, locale, skip_image: true },
        token,
      );
      const recipe = await fetchRecipe(result.recipe_id as string);
      setStep({
        kind: "review",
        recipe,
        image: { kind: "pending" },
        regenerating: false,
        version: 0,
      });
      generateImageInBackground(result.recipe_id as string, token);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
      setStep({ kind: "form" });
    }
  }

  // ── Regenerate recipe text (image follows asynchronously) ──────────────────
  async function regenerateText(recipeId: string, comments: string) {
    if (!comments.trim()) return;
    setError(null);
    setStep((s) => (s.kind === "review" ? { ...s, regenerating: true } : s));

    try {
      const token = await getToken();
      const result = await callAiRecipe(
        { kind: "regenerate", recipe_id: recipeId, comments, locale, skip_image: true },
        token,
      );
      const recipe = await fetchRecipe(result.recipe_id as string);
      setStep((s) =>
        s.kind === "review"
          ? {
              kind: "review",
              recipe,
              // Keep the existing image visible while the new one generates,
              // so the user isn't flashed a spinner over a picture they already had.
              image: s.image.kind === "loaded" ? s.image : { kind: "pending" },
              regenerating: false,
              version: s.version + 1,
            }
          : {
              kind: "review",
              recipe,
              image: { kind: "pending" },
              regenerating: false,
              version: 0,
            },
      );
      generateImageInBackground(result.recipe_id as string, token);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
      setStep((s) => (s.kind === "review" ? { ...s, regenerating: false } : s));
    }
  }

  function resetToForm() {
    setStep({ kind: "form" });
    setPrompt("");
    // Orphan any in-flight background image gen so it can't mutate later.
    imageGenToken.current++;
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  // Loading spinner (generating / expanding)
  if (step.kind === "generating" || step.kind === "expanding") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 pt-20">
        <div className="size-10 animate-spin rounded-full border-4 border-zinc-200 border-t-amber-500" />
        <p className="text-sm text-zinc-500">{t("addRecipe.generating")}</p>
      </div>
    );
  }

  // Disambiguation cards
  if (step.kind === "disambiguate") {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">{t("disambiguation.title")}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t("disambiguation.pickHint")}</p>
        </div>

        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <div className="flex flex-col gap-3">
          {step.candidates.map((c, i) => (
            <button
              key={i}
              onClick={() => pickCandidate(step.draftId, i)}
              className="flex flex-col gap-1 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-zinc-100 transition hover:ring-amber-300 active:scale-[0.98]"
            >
              <span className="font-semibold text-zinc-900">{c.title}</span>
              <span className="text-sm text-zinc-500">{c.summary}</span>
            </button>
          ))}
        </div>

        <button onClick={resetToForm} className="text-sm text-zinc-400 underline">
          ← {t("addRecipe.title")}
        </button>
      </div>
    );
  }

  // Review (inline-editable). The `key` forces a remount whenever the recipe
  // is replaced (e.g. after a regenerate), resetting the child's inline-edit
  // state. Background image-gen updates preserve `version`, so local edits
  // survive those.
  if (step.kind === "review") {
    return (
      <ReviewRecipe
        key={`${step.recipe.id}-${step.version}`}
        recipe={step.recipe}
        image={step.image}
        regenerating={step.regenerating}
        error={error}
        setError={setError}
        onRegenerate={regenerateText}
        onBack={resetToForm}
      />
    );
  }

  // Default: form
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold text-zinc-900">{t("addRecipe.title")}</h1>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <form onSubmit={submitPrompt} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-700">{t("addRecipe.promptLabel")}</label>
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t("addRecipe.promptPlaceholder")}
            autoFocus
            className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
        </div>

        <button
          type="submit"
          disabled={!prompt.trim()}
          className="rounded-xl bg-amber-500 py-3 text-base font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
        >
          {t("addRecipe.generateButton")}
        </button>
      </form>
    </div>
  );
}

// ─── Review sub-component with inline editing ────────────────────────────────

function ReviewRecipe({
  recipe,
  image,
  regenerating,
  error,
  setError,
  onRegenerate,
  onBack,
}: {
  recipe: Recipe;
  image: ImageState;
  regenerating: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  onRegenerate: (recipeId: string, comments: string) => void;
  onBack: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();

  // Editable copies of the recipe, initialised from props. The parent remounts
  // this component (via `key`) whenever the recipe is regenerated, so we never
  // need to sync state back from props after mount.
  const [title, setTitle]               = useState(recipe.title);
  const [summary, setSummary]           = useState(recipe.summary ?? "");
  const [ingredients, setIngredients]   = useState<{ text: string; is_core?: boolean; emoji?: string; color?: string }[]>(() =>
    recipe.full_ingredients,
  );
  const [instructions, setInstructions] = useState<string[]>(() =>
    recipe.instructions.map((s) => s.text),
  );
  const [editingIng, setEditingIng]     = useState<number | null>(null);
  const [comment, setComment]           = useState("");
  const [saving, setSaving]             = useState(false);
  const [discarding, setDiscarding]     = useState(false);
  const [isEditing, setIsEditing]       = useState(false);

  // ── Ingredient helpers ─────────────────────────────────────────────────────
  function removeIngredient(i: number) {
    setIngredients((prev) => prev.filter((_, idx) => idx !== i));
    if (editingIng === i) setEditingIng(null);
  }
  function updateIngredient(i: number, val: string) {
    setIngredients((prev) => prev.map((v, idx) => (idx === i ? { ...v, text: val } : v)));
  }
  function toggleIngredientCore(i: number) {
    setIngredients((prev) => prev.map((v, idx) => idx === i ? { ...v, is_core: !v.is_core } : v));
  }
  function addIngredient() {
    const newIndex = ingredients.length;
    setIngredients((prev) => [...prev, { text: "", is_core: false }]);
    setEditingIng(newIndex);
  }

  // ── Step helpers ───────────────────────────────────────────────────────────
  function removeStep(i: number) {
    setInstructions((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateStep(i: number, val: string) {
    setInstructions((prev) => prev.map((v, idx) => (idx === i ? val : v)));
  }
  function addStep() {
    setInstructions((prev) => [...prev, ""]);
  }

  // ── Save inline edits, then navigate to the recipe detail page ────────────
  async function save() {
    setSaving(true);
    setError(null);

    const trimmedIngredients = ingredients
      .map((v) => ({ text: v.text.trim(), is_core: v.is_core, emoji: v.emoji, color: v.color }))
      .filter((v) => v.text);
    const trimmedInstructions = instructions
      .map((v, i) => ({ step: i + 1, text: v.trim() }))
      .filter((s) => s.text);

    const sb = getSupabaseBrowserClient();
    const { error: sbErr } = await sb
      .from("recipes")
      .update({
        title:            title.trim() || recipe.title,
        summary:          summary.trim() || null,
        full_ingredients: trimmedIngredients,
        instructions:     trimmedInstructions,
      })
      .eq("id", recipe.id);

    if (sbErr) {
      setError(sbErr.message);
      setSaving(false);
      return;
    }
    router.push(`/recipe/${recipe.id}`);
  }

  async function discard() {
    setDiscarding(true);
    const sb = getSupabaseBrowserClient();
    await sb
      .from("recipes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", recipe.id);
    onBack();
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      {/* Hero image — recipe renders above without waiting for this to resolve */}
      <div className="relative -mx-4 aspect-video w-[calc(100%+2rem)] overflow-hidden bg-zinc-100">
        {image.kind === "loaded" ? (
          <Image
            src={image.url}
            alt={title}
            width={800}
            height={450}
            className="h-full w-full object-cover"
            priority
            unoptimized
          />
        ) : image.kind === "failed" ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-400">
            <div className="text-4xl">🍳</div>
            <p className="text-xs">{t("addRecipe.imageFailed")}</p>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <div className="size-6 animate-spin rounded-full border-2 border-zinc-300 border-t-amber-500" />
            <p className="text-xs text-zinc-400">{t("addRecipe.generatingImage")}</p>
          </div>
        )}
      </div>

      {/* Title + summary (inline-editable) */}
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-4">
          {isEditing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 rounded-xl border border-transparent bg-zinc-100 px-3 py-2 text-2xl font-semibold text-zinc-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
            />
          ) : (
            <h1 className="text-2xl font-semibold text-zinc-900">{title}</h1>
          )}
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50"
          >
            {isEditing ? t("recipeDetail.cancel") ?? "Cancel" : t("recipeDetail.editButton")}
          </button>
        </div>

        {isEditing ? (
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            placeholder={t("recipeDetail.summaryPlaceholder")}
            className="mt-2 w-full resize-none rounded-xl border border-transparent bg-zinc-100 px-3 py-3 text-sm text-zinc-700 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
          />
        ) : (
          summary && <p className="mt-1 text-sm text-zinc-500">{summary}</p>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* Ingredients — list format */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-zinc-900">
          {t("recipeDetail.ingredients")}
        </h2>
        {isEditing ? (
          <ul className="flex flex-col gap-2">
            {ingredients.map((ing, i) => (
              <li key={i} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleIngredientCore(i)}
                  className={`shrink-0 flex items-center justify-center size-8 rounded-full border transition ${
                    ing.is_core
                      ? "border-amber-300 bg-amber-50 text-amber-500"
                      : "border-zinc-200 bg-zinc-50 text-zinc-300 hover:text-zinc-400"
                  }`}
                  title={ing.is_core ? "Core ingredient" : "Mark as core ingredient"}
                >
                  {ing.is_core ? "⭐" : "☆"}
                </button>
                <input
                  value={ing.text}
                  autoFocus={editingIng === i}
                  onChange={(e) => updateIngredient(i, e.target.value)}
                  placeholder={t("recipeDetail.addIngredient")}
                  className="flex-1 rounded-xl border border-transparent bg-zinc-100 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
                />
                <button
                  type="button"
                  onClick={() => removeIngredient(i)}
                  aria-label="Remove ingredient"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-red-50 hover:text-red-500"
                >
                  ×
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={addIngredient}
                className="ml-5 mt-1 rounded-xl border border-dashed border-zinc-300 px-3 py-1.5 text-sm text-zinc-500 transition hover:border-amber-400 hover:text-amber-600"
              >
                + {t("recipeDetail.addIngredient")}
              </button>
            </li>
          </ul>
        ) : (
          <ul className="flex flex-col gap-2">
            {ingredients.map((ing, i) => {
              const defaultColor = ing.is_core ? "amber" : "slate";
              const colorClass = colorMap[ing.color || defaultColor] || colorMap[defaultColor];
              return (
                <li key={i} className="flex items-center gap-3 text-sm text-zinc-700">
                  {ing.emoji ? (
                    <div className={`flex size-6 shrink-0 items-center justify-center rounded-full ${colorClass} text-xs`}>
                      {ing.emoji}
                    </div>
                  ) : (
                    <div className="flex w-6 shrink-0 items-center justify-center">
                      <div className={`h-1.5 w-1.5 rounded-full ${ing.is_core ? "bg-amber-400" : "bg-zinc-300"}`} />
                    </div>
                  )}
                  <span className={`flex-1 leading-relaxed ${ing.is_core ? "font-medium text-zinc-800" : ""}`}>{ing.text || "…"}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Instructions — always-editable steps with × to delete */}
      <section>
        <h2 className="mb-2 text-base font-semibold text-zinc-900">
          {t("recipeDetail.instructions")}
        </h2>
        <ol className="flex flex-col gap-3">
          {instructions.map((text, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
                {i + 1}
              </span>
              {isEditing ? (
                <>
                  <textarea
                    value={text}
                    onChange={(e) => updateStep(i, e.target.value)}
                    rows={2}
                    className="flex-1 resize-none rounded-xl border border-transparent bg-zinc-100 px-3 py-2 text-sm leading-relaxed text-zinc-700 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
                  />
                  <button
                    type="button"
                    onClick={() => removeStep(i)}
                    aria-label="Remove step"
                    className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-red-50 hover:text-red-500"
                  >
                    ×
                  </button>
                </>
              ) : (
                <p className="flex-1 mt-1 text-sm leading-relaxed text-zinc-700 whitespace-pre-wrap">{text}</p>
              )}
            </li>
          ))}
        </ol>
        {isEditing && (
          <button
            type="button"
            onClick={addStep}
            className="ml-9 mt-3 rounded-xl border border-dashed border-zinc-300 px-3 py-1.5 text-sm text-zinc-500 transition hover:border-amber-400 hover:text-amber-600"
          >
            + {t("recipeDetail.addStep")}
          </button>
        )}
      </section>

      {/* Regenerate with comments */}
      <section className="flex flex-col gap-2 rounded-2xl bg-zinc-50 p-4">
        <label className="text-sm font-medium text-zinc-700">
          {t("regenerate.commentsLabel")}
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          placeholder={t("regenerate.commentsPlaceholder")}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-amber-400"
        />
        <button
          onClick={() => {
            onRegenerate(recipe.id, comment);
            setComment("");
          }}
          disabled={regenerating || !comment.trim()}
          className="rounded-xl bg-zinc-800 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-900 disabled:opacity-50"
        >
          {regenerating ? t("regenerate.regenerating") : t("regenerate.button")}
        </button>
      </section>

      {/* Save / Discard buttons */}
      <div className="flex gap-3">
        <button
          onClick={discard}
          disabled={discarding || saving}
          className="flex-1 rounded-xl border border-red-100 py-3 text-base font-medium text-red-500 transition hover:bg-red-50 disabled:opacity-60"
        >
          {t("recipeDetail.cancel")}
        </button>
        <button
          onClick={save}
          disabled={saving || discarding}
          className="flex-[2] rounded-xl bg-amber-500 py-3 text-base font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
        >
          {saving ? t("recipeEdit.saving") : `${t("recipeEdit.saveButton")} →`}
        </button>
      </div>
    </div>
  );
}
