import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import RecipeList from "@/components/RecipeList";

export default async function LibraryPage() {
  const supabase = await createClient();
  const t        = await getTranslations("library");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", user!.id)
    .single();

  const { data: recipes } = await supabase
    .from("recipes")
    .select("id, title, summary, hero_image_path, source_type, created_at")
    .eq("household_id", profile!.household_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  // Resolve public Storage URLs server-side
  const recipesWithUrls = (recipes ?? []).map((r) => ({
    ...r,
    hero_image_url: r.hero_image_path
      ? supabase.storage
          .from("recipe-images")
          .getPublicUrl(r.hero_image_path).data.publicUrl
      : null,
  }));

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-zinc-900">{t("title")}</h1>
      <RecipeList recipes={recipesWithUrls} />
    </div>
  );
}
