import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "ru", "uk"],
  defaultLocale: "ru", // Mom's default
});
