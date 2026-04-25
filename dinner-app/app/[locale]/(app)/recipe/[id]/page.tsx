import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import RecipeDetailView from "@/components/RecipeDetailView";

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const supabase = await createClient();

  const { data: recipe, error } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error || !recipe) notFound();

  const heroUrl = recipe.hero_image_path
    ? supabase.storage
        .from("recipe-images")
        .getPublicUrl(recipe.hero_image_path).data.publicUrl
    : null;

  // Fetch core ingredient names + aliases for chip highlighting
  const { data: coreRows } = await supabase
    .from("recipe_core_ingredients")
    .select("ingredients(name_en, name_ru, name_uk, aliases)")
    .eq("recipe_id", id);

  const coreTerms: string[] = [];
  for (const row of coreRows ?? []) {
    const ing = row.ingredients as { name_en?: string; name_ru?: string; name_uk?: string; aliases?: string[] } | null;
    if (!ing) continue;
    const nameForLocale =
      locale === "ru" ? ing.name_ru :
      locale === "uk" ? ing.name_uk :
      ing.name_en;
    if (nameForLocale) coreTerms.push(nameForLocale.toLowerCase());
    if (ing.name_en) coreTerms.push(ing.name_en.toLowerCase());
    if (ing.name_ru) coreTerms.push(ing.name_ru.toLowerCase());
    if (ing.name_uk) coreTerms.push(ing.name_uk.toLowerCase());
    for (const alias of ing.aliases ?? []) coreTerms.push(alias.toLowerCase());
  }

  return <RecipeDetailView recipe={recipe} heroUrl={heroUrl} coreTerms={coreTerms} />;
}
