"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import Image from "next/image";
import { useRouter } from "next/navigation";

interface Ingredient {
  id: number;
  slug: string;
  category: string | null;
  name_en: string;
  name_ru: string | null;
  name_uk: string | null;
}

export default function CookPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [selectedChips, setSelectedChips] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [generating, setGenerating] = useState(false);
  
  const [suggestion, setSuggestion] = useState<any | null>(null);
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [noMatch, setNoMatch] = useState(false);
  
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: profile } = await supabase
        .from("profiles")
        .select("household_id")
        .eq("id", user.id)
        .single();
        
      if (!profile) return;

      const [ingsRes, selRes] = await Promise.all([
        supabase.from("ingredients").select("*").order("category"),
        supabase.from("last_selection").select("ingredient_ids").eq("household_id", profile.household_id).maybeSingle()
      ]);

      if (ingsRes.data) {
        setIngredients(ingsRes.data);
      }
      
      if (selRes.data && selRes.data.ingredient_ids) {
        setSelectedChips(new Set(selRes.data.ingredient_ids));
      }
      setLoading(false);
    }
    load();
  }, [supabase]);

  const toggleChip = (id: number) => {
    setSelectedChips(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getName = (ing: Ingredient) => {
    if (locale === "ru" && ing.name_ru) return ing.name_ru;
    if (locale === "uk" && ing.name_uk) return ing.name_uk;
    return ing.name_en;
  };

  const grouped = ingredients.reduce((acc, ing) => {
    const cat = ing.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(ing);
    return acc;
  }, {} as Record<string, Ingredient[]>);

  const handleSuggest = async (currentSeen: string[] = []) => {
    setSuggesting(true);
    setNoMatch(false);
    
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("household_id").eq("id", user.id).single();
      if (profile) {
        await supabase.from("last_selection").upsert({
          household_id: profile.household_id,
          ingredient_ids: Array.from(selectedChips),
          updated_by: user.id,
          updated_at: new Date().toISOString()
        });
      }
    }

    const { data, error } = await supabase.rpc("suggest_recipe", {
      selected_ingredient_ids: Array.from(selectedChips),
      already_seen_recipe_ids: currentSeen
    });

    if (!error && data && data.length > 0) {
      const recipe = data[0];
      let imageUrl = null;
      if (recipe.hero_image_path) {
        const { data: publicUrlData } = supabase.storage
          .from("recipe-images")
          .getPublicUrl(recipe.hero_image_path);
        imageUrl = publicUrlData.publicUrl;
      }
      setSuggestion({ ...recipe, imageUrl });
    } else {
      setSuggestion(null);
      setNoMatch(true);
    }
    
    setSuggesting(false);
  };

  const handleShowAnother = () => {
    if (!suggestion) return;
    const newSeen = [...seenIds, suggestion.id];
    setSeenIds(newSeen);
    handleSuggest(newSeen);
  };

  const handleAccept = async () => {
    if (!suggestion) return;
    setAccepting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("household_id").eq("id", user.id).single();
      if (profile) {
        await supabase.from("decisions").insert({
          household_id: profile.household_id,
          user_id: user.id,
          recipe_id: suggestion.id,
          via: "direct"
        });
      }
    }
    router.push(`/${locale}/recipe/${suggestion.id}`);
  };

  const handleGenerateNew = async () => {
    if (selectedChips.size === 0) return;
    setGenerating(true);
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    
    const selectedSlugs = ingredients
      .filter(i => selectedChips.has(i.id))
      .map(i => i.slug);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-recipe`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            kind: "suggest-from-chips",
            core_slugs: selectedSlugs,
            locale,
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        if (data.recipe_id) {
          router.push(`/${locale}/recipe/${data.recipe_id}`);
          return;
        }
      }
    } catch (e) {
      console.error(e);
    }
    setGenerating(false);
  };

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-4 border-amber-200 border-t-amber-500" />
      </div>
    );
  }

  if (suggestion) {
    return (
      <div className="mx-auto max-w-lg">
        <button onClick={() => setSuggestion(null)} className="mb-4 text-sm text-zinc-500 underline transition hover:text-zinc-800">
          ← {t("cook.title")}
        </button>
        
        <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
          {suggestion.imageUrl ? (
            <div className="relative aspect-video w-full bg-zinc-100">
              <Image
                src={suggestion.imageUrl}
                alt={suggestion.title}
                width={800}
                height={450}
                className="h-full w-full object-cover"
                unoptimized
              />
            </div>
          ) : (
            <div className="flex aspect-video w-full items-center justify-center bg-zinc-100 text-sm text-zinc-400">
              {suggestion.title}
            </div>
          )}
          <div className="p-5">
            <h2 className="text-2xl font-bold text-zinc-900">{suggestion.title}</h2>
            {suggestion.summary && <p className="mt-2 text-sm leading-relaxed text-zinc-600">{suggestion.summary}</p>}
            
            <div className="mt-6 flex flex-col gap-3">
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="rounded-2xl bg-amber-500 py-3.5 font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
              >
                {accepting ? t("cook.accepting") : t("cook.acceptButton")}
              </button>
              <button
                onClick={handleShowAnother}
                disabled={suggesting}
                className="rounded-2xl border border-zinc-200 bg-white py-3.5 font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
              >
                {suggesting ? t("cook.suggesting") : t("cook.showAnother")}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-2xl font-bold text-zinc-900">{t("cook.title")}</h1>
      <p className="mb-6 text-sm text-zinc-500">{t("cook.chipHint")}</p>

      {noMatch && (
        <div className="mb-8 rounded-2xl bg-amber-50 p-4">
          <p className="mb-3 text-sm text-amber-900">{t("cook.noMatch")}</p>
          <button
            onClick={handleGenerateNew}
            disabled={generating}
            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600 disabled:opacity-50"
          >
            {generating ? t("addRecipe.generating") : t("cook.generateFromChipsButton")}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-8 pb-32">
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-400">
              {/* Note: In production we'd use useTranslations safely without 'any', but this is a quick mapping */}
              {t(`ingredientCategories.${category}` as any) || category}
            </h2>
            <div className="flex flex-wrap gap-2">
              {items.map(ing => (
                <button
                  key={ing.id}
                  onClick={() => toggleChip(ing.id)}
                  className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                    selectedChips.has(ing.id)
                      ? "bg-amber-500 text-white shadow-sm"
                      : "bg-white text-zinc-700 border border-zinc-200 hover:border-amber-300"
                  }`}
                >
                  {getName(ing)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="fixed bottom-[4.5rem] left-0 right-0 border-t border-zinc-100 bg-white/80 p-4 backdrop-blur-md md:bottom-0 md:border-t-0 md:bg-transparent md:p-0 md:sticky">
        <div className="mx-auto max-w-lg">
          <button
            onClick={() => handleSuggest([])}
            disabled={selectedChips.size === 0 || suggesting}
            className="w-full rounded-2xl bg-zinc-900 py-4 text-base font-semibold text-white shadow-md transition hover:bg-zinc-800 disabled:opacity-50"
          >
            {suggesting ? t("cook.suggesting") : t("cook.suggestButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
