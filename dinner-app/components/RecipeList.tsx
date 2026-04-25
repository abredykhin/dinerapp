"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import RecipeCard from "./RecipeCard";

interface Recipe {
  id: string;
  title: string;
  summary: string | null;
  hero_image_url: string | null;
  source_type: "ai" | "scraped";
  created_at: string;
}

export default function RecipeList({ recipes }: { recipes: Recipe[] }) {
  const t = useTranslations("library");
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? recipes.filter((r) =>
        r.title.toLowerCase().includes(query.toLowerCase()),
      )
    : recipes;

  return (
    <div className="flex flex-col gap-4">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchPlaceholder")}
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-base text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
      />

      {filtered.length === 0 ? (
        <p className="mt-8 text-center text-sm text-zinc-400">
          {query ? t("noResults") : t("empty")}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}
    </div>
  );
}
