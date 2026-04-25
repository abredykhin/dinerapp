import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

interface Recipe {
  id: string;
  title: string;
  summary: string | null;
  hero_image_url: string | null;
  source_type: "ai" | "scraped";
}

export default function RecipeCard({ recipe }: { recipe: Recipe }) {
  const t = useTranslations("recipeCard");

  return (
    <Link
      href={`/recipe/${recipe.id}`}
      className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 transition-shadow hover:shadow-md active:scale-[0.98]"
    >
      {/* Hero image */}
      <div className="relative aspect-square w-full bg-zinc-100">
        {recipe.hero_image_url ? (
          <Image
            src={recipe.hero_image_url}
            alt={recipe.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 50vw, 200px"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-3xl">
            🍳
          </div>
        )}
      </div>

      {/* Text */}
      <div className="flex flex-col gap-0.5 p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-900">
          {recipe.title}
        </p>
        {recipe.summary && (
          <p className="line-clamp-2 text-xs text-zinc-500">{recipe.summary}</p>
        )}
        <span className="mt-1 w-fit rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
          {t(`source_${recipe.source_type}`)}
        </span>
      </div>
    </Link>
  );
}
