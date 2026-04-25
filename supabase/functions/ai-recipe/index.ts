/**
 * ai-recipe Edge Function
 *
 * Handles all AI-driven recipe operations via a single `kind` discriminator:
 *   author            — classify a dish name, optionally disambiguate, then expand
 *   suggest-from-chips — generate a recipe from a set of ingredient slugs
 *   regenerate        — revise an existing recipe with user comments
 *   regenerate-image  — replace only the hero image of an existing recipe
 *
 * External services:
 *   - Google Gemini (text)  via REST — model configurable via GEMINI_TEXT_MODEL env var
 *   - Google Gemini (image) via REST — model configurable via GEMINI_IMAGE_MODEL env var
 *   - Supabase (Postgres + Storage) via supabase-js service-role client
 *
 * Auth: every request must carry a valid Supabase JWT in Authorization: Bearer <token>.
 * The service-role key is used for all DB/Storage writes; it never leaves this function.
 */

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

// ─── Constants ────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const TEXT_MODEL     = Deno.env.get("GEMINI_TEXT_MODEL")  ?? "gemini-3.1-flash-lite-preview";
const IMAGE_MODEL    = Deno.env.get("GEMINI_IMAGE_MODEL") ?? "gemini-3.1-flash-image-preview";
const GEMINI_BASE    = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Fixed style preamble prepended to every image-generation prompt.
 * Keeps the photo library visually coherent. Tweak this constant to restyle.
 */
const IMAGE_STYLE =
  "Overhead flat-lay photograph, natural daylight, warm wood or linen surface, " +
  "simple ceramic plateware, shallow depth of field, no text, no logos, " +
  "appetizing homestyle composition. Dish: ";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Locale = "en" | "ru" | "uk";

interface Candidate {
  title: string;
  summary: string;
  core_ingredient_slugs: string[];
}

interface RecipePayload {
  title: string;
  summary: string;
  core_ingredient_slugs: string[];
  full_ingredients: Array<{ text: string; is_core: boolean; emoji: string; color: string }>;
  instructions: Array<{ step: number; text: string }>;
}

interface IngredientRow {
  id: number;
  slug: string;
  name_en: string;
  name_ru: string | null;
  name_uk: string | null;
  aliases: string[];
}

// ─── Gemini JSON schemas (uppercase type strings per REST API spec) ───────────

const CLASSIFY_SCHEMA = {
  type: "OBJECT",
  properties: {
    ambiguous: { type: "BOOLEAN" },
    candidates: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title:   { type: "STRING" },
          summary: { type: "STRING" },
          core_ingredient_slugs: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["title", "summary", "core_ingredient_slugs"],
      },
    },
  },
  required: ["ambiguous", "candidates"],
};

const RECIPE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title:   { type: "STRING" },
    summary: { type: "STRING" },
    core_ingredient_slugs: { type: "ARRAY", items: { type: "STRING" } },
    full_ingredients: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { 
          text: { type: "STRING" },
          is_core: { type: "BOOLEAN" },
          emoji: { type: "STRING" },
          color: { type: "STRING" }
        },
        required: ["text", "is_core", "emoji", "color"],
      },
    },
    instructions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          step: { type: "INTEGER" },
          text: { type: "STRING" },
        },
        required: ["step", "text"],
      },
    },
  },
  required: [
    "title", "summary", "core_ingredient_slugs",
    "full_ingredients", "instructions",
  ],
};

// ─── Gemini helpers ───────────────────────────────────────────────────────────

async function geminiText<T>(prompt: string, schema: unknown, tag: string = "geminiText"): Promise<T> {
  const url  = `${GEMINI_BASE}/models/${TEXT_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  
  const start = performance.now();
  const res  = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema:   schema,
      },
    }),
  });
  const elapsedFetch = performance.now() - start;
  
  if (!res.ok) throw new Error(`Gemini text ${res.status}: ${await res.text()}`);
  
  const jsonStart = performance.now();
  const json = await res.json();
  const elapsedJson = performance.now() - jsonStart;
  
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini text response");
  
  console.log(`[Timer] ${tag} - fetch: ${elapsedFetch.toFixed(0)}ms, parse: ${elapsedJson.toFixed(0)}ms`);
  return JSON.parse(text) as T;
}

async function geminiImage(
  description: string,
): Promise<{ data: Uint8Array; mimeType: string }> {
  const url = `${GEMINI_BASE}/models/${IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: IMAGE_STYLE + description }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  });
  if (!res.ok) throw new Error(`Gemini image ${res.status}: ${await res.text()}`);
  const json      = await res.json();
  const parts     = json.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p: { inlineData?: unknown }) => p.inlineData);
  if (!imagePart?.inlineData) throw new Error("No image part in Gemini response");
  const { data: b64, mimeType } = imagePart.inlineData as { data: string; mimeType: string };
  return {
    data:     Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
    mimeType: mimeType ?? "image/jpeg",
  };
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function userClient(jwt: string): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } },
  );
}

async function getProfile(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, household_id, role, locale")
    .eq("id", userId)
    .single();
  if (error || !data) throw new Error("Profile not found — make sure a profiles row exists for this user");
  return data as { id: string; household_id: string; role: string; locale: Locale };
}

/** Load the full ingredient vocabulary once per request (only ~100 rows). */
async function getAllIngredients(admin: SupabaseClient): Promise<IngredientRow[]> {
  const { data } = await admin
    .from("ingredients")
    .select("id, slug, name_en, name_ru, name_uk, aliases");
  return (data ?? []) as IngredientRow[];
}

/**
 * Match raw slugs (which Gemini may return in various forms) against the
 * controlled vocabulary using both the slug and the aliases array.
 * Unknown slugs are silently dropped with a console.warn.
 */
function resolveIngredients(
  rawSlugs: string[],
  allIngredients: IngredientRow[],
): Array<{ id: number; slug: string }> {
  const seen   = new Set<number>();
  const result: Array<{ id: number; slug: string }> = [];
  for (const raw of rawSlugs) {
    const lower = raw.toLowerCase().trim();
    const match = allIngredients.find(
      (r) =>
        r.slug === lower ||
        r.aliases.some((a) => a.toLowerCase() === lower),
    );
    if (match && !seen.has(match.id)) {
      seen.add(match.id);
      result.push({ id: match.id, slug: match.slug });
    } else if (!match) {
      console.warn(`Unknown ingredient slug dropped: "${raw}"`);
    }
  }
  return result;
}

/** Get the display name for an ingredient in the given locale. */
function ingredientDisplayName(r: IngredientRow, locale: Locale): string {
  if (locale === "ru" && r.name_ru) return r.name_ru;
  if (locale === "uk" && r.name_uk) return r.name_uk;
  return r.name_en;
}

async function uploadImage(
  admin: SupabaseClient,
  imageData: { data: Uint8Array; mimeType: string },
  existingPath: string | null,
): Promise<string> {
  if (existingPath) {
    // Best-effort delete of old image — don't fail the whole request if it's missing
    await admin.storage.from("recipe-images").remove([existingPath]).catch(console.warn);
  }
  const ext  = imageData.mimeType.includes("png") ? "png" : "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage
    .from("recipe-images")
    .upload(path, imageData.data, { contentType: imageData.mimeType });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return path;
}

async function logGeneration(
  admin: SupabaseClient,
  params: {
    userId: string;
    householdId: string;
    kind: string;
    input: unknown;
    model: string;
    outputRecipeId?: string;
  },
): Promise<void> {
  // Non-fatal — a logging failure must never block the main response
  try {
    await admin.from("ai_generations").insert({
      user_id:          params.userId,
      household_id:     params.householdId,
      kind:             params.kind,
      input:            params.input,
      model:            params.model,
      output_recipe_id: params.outputRecipeId ?? null,
    });
  } catch (e) {
    console.warn("ai_generations log failed (non-fatal):", e);
  }
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function classifyPrompt(dishName: string, locale: Locale, knownSlugs: string[]): string {
  return `You are a cooking assistant helping a home cook build a recipe library.

The user wants to add a dish called: "${dishName}"
Output locale (all titles and summaries must be in this language): ${locale}

Is this dish name ambiguous — meaning it could reasonably refer to two or more meaningfully different dishes or preparation methods?
Examples of ambiguous names: "пирог" (could be sweet or savoury), "котлеты" (could be meat patties or fish cakes), "пельмени" (could be homemade from scratch OR just cooking frozen store-bought ones).
Examples of non-ambiguous names: "борщ", "chicken stir-fry", "mac and cheese".

Rules:
- If AMBIGUOUS: return ambiguous=true and up to 3 distinct candidates. Each candidate needs a title, a 1-sentence summary, and suggested core ingredient slugs.
- If NOT AMBIGUOUS: return ambiguous=false and exactly ONE candidate with the canonical title, a 1-sentence summary, and suggested core ingredient slugs.

Core ingredient slugs MUST come only from this controlled vocabulary (never invent new ones):
${knownSlugs.join(", ")}

Slug rules:
- Only include high-level, decision-driving ingredients (proteins, key vegetables, main starches)
- Never include: salt, pepper, spices, garlic, oil, butter, sugar, flour, water, vinegar
- NEVER use generic 'minced_meat'. If the dish uses minced meat, you MUST specify the animal type (e.g., 'pork', 'beef', 'chicken').`;
}

function expandPrompt(
  dishName: string,
  summary: string,
  hintSlugs: string[],
  locale: Locale,
  knownSlugs: string[],
  comments?: string,
): string {
  return `You are a cooking assistant. Generate a complete home-cooking recipe.

Dish: "${dishName}"${summary ? `\nDescription: ${summary}` : ""}${
    comments ? `\n\nUser feedback to incorporate: "${comments}"` : ""
  }

Output locale (ALL text — title, summary, ingredients, instructions — must be in this language): ${locale}

For core_ingredient_slugs, choose ONLY from this controlled vocabulary:
${knownSlugs.join(", ")}

Core slug rules:
- Only the main ingredients that define the dish (proteins, key vegetables, main starch)
- Never include staples or secondary aromatics (onion, garlic, salt, oil, butter, sugar, flour, spices, water) unless they are the absolute main feature of the dish.
- NEVER use generic 'minced_meat'. You MUST specify the animal type (e.g., 'pork', 'beef', 'chicken').
- Use these as a starting point if they fit: ${hintSlugs.join(", ")}

For full_ingredients: list all meaningful ingredients with quantities. 
1. Set 'is_core' to true ONLY for the primary ingredients that define the dish (the ones you selected for core_ingredient_slugs). Set 'is_core' to false for aromatics, staples, and secondary ingredients.
2. Provide a suitable 'emoji' for each ingredient.
3. Provide a UI 'color' theme for each ingredient. Choose ONLY from these exact strings: 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose', 'slate'. (e.g., meats=red/rose, greens=green/emerald, dairy/grains=amber/yellow, spices/staples=slate).
CRITICAL: ALWAYS start the ingredient text with the simple base noun translated into the output locale (e.g., 'Капуста — 1 кочан' instead of 'Капуста белокочанная', 'Свинина — 600 г' instead of 'Свиная лопатка'). Remove unnecessary adjectives. For minced meat, explicitly name the meat type (e.g., 'Свиной фарш' or 'Говяжий фарш').
Do NOT include pantry staples: salt, pepper, spices, garlic, oil, butter, sugar, water, flour, vinegar — assume the cook already has them.
For instructions: clear, numbered, practical steps for a home cook.`;
}

function chipsPrompt(
  slugs: string[],
  displayNames: string[],
  locale: Locale,
  knownSlugs: string[],
): string {
  return `You are a cooking assistant. Generate a creative, appetizing home-cooking recipe that uses these main ingredients: ${displayNames.join(", ")}.

Output locale (ALL text must be in this language): ${locale}

For core_ingredient_slugs, choose ONLY from this controlled vocabulary:
${knownSlugs.join(", ")}

Core slug rules:
- The recipe MUST feature all or most of these core ingredients: ${slugs.join(", ")}
- Never include staples or secondary aromatics (onion, garlic, salt, oil, butter, sugar, flour) in core_ingredient_slugs
- NEVER use generic 'minced_meat'. You MUST specify the animal type (e.g., 'pork', 'beef', 'chicken').
- full_ingredients must list all meaningful ingredients with quantities. Set 'is_core' to true ONLY for the primary ingredients (the ones in core_ingredient_slugs) and false for everything else. Assign an 'emoji' and 'color' (from 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose', 'slate') to each.
CRITICAL: ALWAYS start the ingredient text with the simple base noun translated into the output locale (e.g., 'Капуста — 1 кочан' instead of 'Капуста белокочанная', 'Свинина — 600 г' instead of 'Свиная лопатка'). Remove unnecessary adjectives. For minced meat, explicitly name the meat type (e.g., 'Свиной фарш' or 'Говяжий фарш').
- do NOT include pantry staples (salt, pepper, spices, oil, butter, sugar, water, flour)
- Instructions must be clear and practical for a home cook`;
}

function regeneratePrompt(
  recipe: {
    title: string;
    summary?: string;
    full_ingredients: Array<{ text: string; is_core?: boolean; emoji?: string; color?: string }>;
    instructions: Array<{ step: number; text: string }>;
  },
  comments: string,
  locale: Locale,
  knownSlugs: string[],
): string {
  return `You are a cooking assistant. Revise this recipe based on user feedback.

Original recipe: "${recipe.title}"${recipe.summary ? `\nDescription: ${recipe.summary}` : ""}

Original ingredients:
${recipe.full_ingredients.map((i) => `- ${i.text}`).join("\n")}

Original instructions:
${recipe.instructions.map((s) => `${s.step}. ${s.text}`).join("\n")}

User feedback: "${comments}"

Output locale (ALL text must be in this language): ${locale}

Generate an improved version of this recipe incorporating the feedback.

For full_ingredients: set 'is_core' to true ONLY for the primary ingredients (the ones in core_ingredient_slugs) and false for everything else. Assign an 'emoji' and 'color' (from 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose', 'slate') to each.
CRITICAL: ALWAYS start the ingredient text with the simple base noun translated into the output locale (e.g., 'Капуста — 1 кочан' instead of 'Капуста белокочанная', 'Свинина — 600 г' instead of 'Свиная лопатка'). Remove unnecessary adjectives. For minced meat, explicitly name the meat type (e.g., 'Свиной фарш' or 'Говяжий фарш').
Do NOT include pantry staples (salt, pepper, spices, oil, butter, sugar, water, flour, vinegar).

For core_ingredient_slugs, choose ONLY from this controlled vocabulary:
${knownSlugs.join(", ")}
(Staples are not in this vocabulary — do not include them. NEVER use generic 'minced_meat' - specify 'pork', 'beef', or 'chicken' instead).`;
}

// ─── Shared: build + persist a fully-expanded recipe ─────────────────────────

/**
 * Given a ready RecipePayload from Gemini:
 *   1. Generate and upload the hero image.
 *   2. Resolve ingredient slugs against the controlled vocabulary.
 *   3. Insert (or update) the recipes row.
 *   4. (Re)insert recipe_core_ingredients rows.
 *
 * Returns { recipeId, imagePath, resolvedSlugs }.
 */
async function persistRecipe(
  admin: SupabaseClient,
  params: {
    householdId: string;
    userId: string;
    payload: RecipePayload;
    locale: Locale;
    allIngredients: IngredientRow[];
    existingRecipeId?: string;
    existingImagePath?: string | null;
    skipImage?: boolean;
  },
): Promise<{ recipeId: string; imagePath: string | null; resolvedSlugs: string[] }> {
  const { payload, allIngredients } = params;

  // 1. Generate + upload image (unless caller wants to do it separately)
  let imagePath: string | null = params.existingImagePath ?? null;
  if (!params.skipImage) {
    const imageData = await geminiImage(`${payload.title}. ${payload.summary}`);
    imagePath = await uploadImage(admin, imageData, params.existingImagePath ?? null);
  }

  // 2. Resolve ingredient slugs
  const resolved     = resolveIngredients(payload.core_ingredient_slugs, allIngredients);
  const resolvedSlugs = resolved.map((r) => r.slug);

  // 3. Upsert recipe row
  let recipeId: string;

  if (params.existingRecipeId) {
    const { error } = await admin.from("recipes").update({
      title:            payload.title,
      summary:          payload.summary,
      full_ingredients: payload.full_ingredients,
      instructions:     payload.instructions,
      hero_image_path:  imagePath,
      locale:           params.locale,
      edited_by:        params.userId,
      edited_at:        new Date().toISOString(),
    }).eq("id", params.existingRecipeId);
    if (error) throw new Error(`Recipe update failed: ${error.message}`);
    recipeId = params.existingRecipeId;
  } else {
    const { data, error } = await admin.from("recipes").insert({
      household_id:     params.householdId,
      title:            payload.title,
      summary:          payload.summary,
      source_type:      "ai",
      full_ingredients: payload.full_ingredients,
      instructions:     payload.instructions,
      hero_image_path:  imagePath,
      locale:           params.locale,
      created_by:       params.userId,
    }).select("id").single();
    if (error || !data) throw new Error(`Recipe insert failed: ${error?.message}`);
    recipeId = data.id;
  }

  // 4. Rebuild core ingredients (delete + reinsert is safe and simple)
  await admin.from("recipe_core_ingredients").delete().eq("recipe_id", recipeId);
  if (resolved.length) {
    await admin.from("recipe_core_ingredients").insert(
      resolved.map((r) => ({ recipe_id: recipeId, ingredient_id: r.id })),
    );
  }

  return { recipeId, imagePath, resolvedSlugs };
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async function handleAuthor(
  body: {
    prompt?: string;
    draft_id?: string;
    chosen_index?: number;
    locale?: string;
    skip_image?: boolean;
  },
  userId: string,
  admin: SupabaseClient,
): Promise<unknown> {
  const profile    = await getProfile(admin, userId);
  const locale     = (body.locale ?? profile.locale ?? "en") as Locale;
  const allIngr    = await getAllIngredients(admin);
  const knownSlugs = allIngr.map((r) => r.slug);
  const skipImage  = body.skip_image === true;

  // ── Continuation: user picked a candidate from a previous draft ──────────
  if (body.draft_id != null && body.chosen_index != null) {
    const { data: draft, error } = await admin
      .from("recipe_drafts")
      .select("*")
      .eq("id", body.draft_id)
      .eq("household_id", profile.household_id)
      .single();
    if (error || !draft) throw new Error("Draft not found");

    const candidate = (draft.candidates as Candidate[])[body.chosen_index];
    if (!candidate) throw new Error(`No candidate at index ${body.chosen_index}`);

    const t0 = performance.now();
    const ep = expandPrompt(candidate.title, candidate.summary, candidate.core_ingredient_slugs, locale, knownSlugs);
    const payload = await geminiText<RecipePayload>(ep, RECIPE_SCHEMA, "expandPrompt_draft");
    const t1 = performance.now();
    const { recipeId, resolvedSlugs } = await persistRecipe(admin, {
      householdId: profile.household_id, userId, payload, locale, allIngredients: allIngr, skipImage,
    });
    const t2 = performance.now();
    console.log(`[Timer] handleAuthor(draft) total: ${(t2 - t0).toFixed(0)}ms (expand: ${(t1 - t0).toFixed(0)}ms, persist: ${(t2 - t1).toFixed(0)}ms)`);

    // Mark the draft as promoted
    await admin.from("recipe_drafts").update({
      chosen_index:    body.chosen_index,
      promoted_recipe: recipeId,
    }).eq("id", body.draft_id);

    await logGeneration(admin, {
      userId, householdId: profile.household_id,
      kind: "author", input: body, model: TEXT_MODEL, outputRecipeId: recipeId,
    });

    return { recipe_id: recipeId, core_ingredient_slugs: resolvedSlugs };
  }

  // ── First call: classify the dish name ──────────────────────────────────
  if (!body.prompt?.trim()) throw new Error("prompt is required");

  const cp  = classifyPrompt(body.prompt, locale, knownSlugs);
  const clfStart = performance.now();
  const clf = await geminiText<{ ambiguous: boolean; candidates: Candidate[] }>(cp, CLASSIFY_SCHEMA, "classifyPrompt");
  const clfElapsed = performance.now() - clfStart;

  await logGeneration(admin, {
    userId, householdId: profile.household_id,
    kind: "disambiguate", input: { prompt: body.prompt, locale }, model: TEXT_MODEL,
  });

  // Ambiguous → save draft, return candidates for UI to display
  if (clf.ambiguous && clf.candidates.length > 1) {
    const candidates = clf.candidates.slice(0, 3);
    const { data: draft, error } = await admin.from("recipe_drafts").insert({
      user_id:         userId,
      household_id:    profile.household_id,
      original_prompt: body.prompt,
      candidates,
    }).select("id").single();
    if (error || !draft) throw new Error("Failed to save recipe draft");

    return { ambiguous: true, draft_id: draft.id, candidates };
  }

  // Not ambiguous → expand immediately (single round-trip for the user)
  const best    = clf.candidates[0];
  const title   = best?.title   ?? body.prompt;
  const summary = best?.summary ?? "";
  const hints   = best?.core_ingredient_slugs ?? [];

  const ep      = expandPrompt(title, summary, hints, locale, knownSlugs);
  const expStart = performance.now();
  const payload = await geminiText<RecipePayload>(ep, RECIPE_SCHEMA, "expandPrompt_new");
  const expElapsed = performance.now() - expStart;
  
  const persistStart = performance.now();
  const { recipeId, resolvedSlugs } = await persistRecipe(admin, {
    householdId: profile.household_id, userId, payload, locale, allIngredients: allIngr, skipImage,
  });
  const persistElapsed = performance.now() - persistStart;
  
  console.log(`[Timer] handleAuthor(new) total: ${(clfElapsed + expElapsed + persistElapsed).toFixed(0)}ms (classify: ${clfElapsed.toFixed(0)}ms, expand: ${expElapsed.toFixed(0)}ms, persist: ${persistElapsed.toFixed(0)}ms)`);

  await logGeneration(admin, {
    userId, householdId: profile.household_id,
    kind: "author", input: body, model: TEXT_MODEL, outputRecipeId: recipeId,
  });

  return { ambiguous: false, recipe_id: recipeId, core_ingredient_slugs: resolvedSlugs };
}

async function handleSuggestFromChips(
  body: { core_slugs?: string[]; locale?: string },
  userId: string,
  admin: SupabaseClient,
): Promise<unknown> {
  if (!body.core_slugs?.length) throw new Error("core_slugs is required and must not be empty");

  const profile    = await getProfile(admin, userId);
  const locale     = (body.locale ?? profile.locale ?? "en") as Locale;
  const allIngr    = await getAllIngredients(admin);
  const knownSlugs = allIngr.map((r) => r.slug);

  const displayNames = body.core_slugs
    .map((s) => allIngr.find((r) => r.slug === s))
    .filter(Boolean)
    .map((r) => ingredientDisplayName(r!, locale));

  const prompt  = chipsPrompt(body.core_slugs, displayNames, locale, knownSlugs);
  const payload = await geminiText<RecipePayload>(prompt, RECIPE_SCHEMA);
  const { recipeId, resolvedSlugs } = await persistRecipe(admin, {
    householdId: profile.household_id, userId, payload, locale, allIngredients: allIngr,
  });

  await logGeneration(admin, {
    userId, householdId: profile.household_id,
    kind: "suggest-from-chips", input: body, model: TEXT_MODEL, outputRecipeId: recipeId,
  });

  return { recipe_id: recipeId, core_ingredient_slugs: resolvedSlugs };
}

async function handleRegenerate(
  body: { recipe_id?: string; comments?: string; locale?: string; skip_image?: boolean },
  userId: string,
  admin: SupabaseClient,
): Promise<unknown> {
  if (!body.recipe_id)       throw new Error("recipe_id is required");
  if (!body.comments?.trim()) throw new Error("comments is required");

  const profile    = await getProfile(admin, userId);
  const locale     = (body.locale ?? profile.locale ?? "en") as Locale;
  const allIngr    = await getAllIngredients(admin);
  const knownSlugs = allIngr.map((r) => r.slug);
  const skipImage  = body.skip_image === true;

  const { data: existing, error } = await admin
    .from("recipes")
    .select("id, title, summary, full_ingredients, instructions, hero_image_path, revision_count, household_id")
    .eq("id", body.recipe_id)
    .eq("household_id", profile.household_id)
    .single();
  if (error || !existing) throw new Error("Recipe not found or not accessible");

  const prompt  = regeneratePrompt(existing, body.comments, locale, knownSlugs);
  const payload = await geminiText<RecipePayload>(prompt, RECIPE_SCHEMA);
  const { recipeId, resolvedSlugs } = await persistRecipe(admin, {
    householdId:       profile.household_id,
    userId,
    payload,
    locale,
    allIngredients:    allIngr,
    existingRecipeId:  body.recipe_id,
    existingImagePath: skipImage ? existing.hero_image_path : existing.hero_image_path,
    skipImage,
  });

  // Bump revision counter (persistRecipe updates the row but doesn't touch this field)
  await admin.from("recipes").update({
    revision_count: (existing.revision_count ?? 0) + 1,
  }).eq("id", recipeId);

  await logGeneration(admin, {
    userId, householdId: profile.household_id,
    kind: "regenerate", input: body, model: TEXT_MODEL, outputRecipeId: recipeId,
  });

  return { recipe_id: recipeId, core_ingredient_slugs: resolvedSlugs };
}

async function handleRegenerateImage(
  body: { recipe_id?: string },
  userId: string,
  admin: SupabaseClient,
): Promise<unknown> {
  if (!body.recipe_id) throw new Error("recipe_id is required");

  const profile = await getProfile(admin, userId);

  const { data: recipe, error } = await admin
    .from("recipes")
    .select("id, title, summary, hero_image_path, household_id")
    .eq("id", body.recipe_id)
    .eq("household_id", profile.household_id)
    .single();
  if (error || !recipe) throw new Error("Recipe not found or not accessible");

  const imageData    = await geminiImage(`${recipe.title}. ${recipe.summary ?? ""}`);
  const newImagePath = await uploadImage(admin, imageData, recipe.hero_image_path);

  await admin.from("recipes").update({
    hero_image_path: newImagePath,
    edited_by:       userId,
    edited_at:       new Date().toISOString(),
  }).eq("id", body.recipe_id);

  await logGeneration(admin, {
    userId, householdId: profile.household_id,
    kind: "image", input: { recipe_id: body.recipe_id }, model: IMAGE_MODEL,
    outputRecipeId: body.recipe_id,
  });

  return { recipe_id: body.recipe_id, hero_image_path: newImagePath };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

    const jwt = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authErr,
    } = await userClient(jwt).auth.getUser();
    if (authErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    // Parse body
    const body = await req.json() as Record<string, unknown>;
    const kind = body.kind as string | undefined;

    const admin = adminClient();
    let result: unknown;

    switch (kind) {
      case "author":
        result = await handleAuthor(body as Parameters<typeof handleAuthor>[0], user.id, admin);
        break;
      case "suggest-from-chips":
        result = await handleSuggestFromChips(body as Parameters<typeof handleSuggestFromChips>[0], user.id, admin);
        break;
      case "regenerate":
        result = await handleRegenerate(body as Parameters<typeof handleRegenerate>[0], user.id, admin);
        break;
      case "regenerate-image":
        result = await handleRegenerateImage(body as Parameters<typeof handleRegenerateImage>[0], user.id, admin);
        break;
      default:
        return jsonResponse({ error: `Unknown kind: "${kind}". Valid values: author, suggest-from-chips, regenerate, regenerate-image` }, 400);
    }

    return jsonResponse(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[ai-recipe]", err);
    return jsonResponse({ error: message }, 500);
  }
});

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
