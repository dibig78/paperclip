import translations from "./skill-display-data.json";
export function localizedSkillBody(slug: string, path: string, source: string, language: string): string {
 const entry = translations[slug as keyof typeof translations];
 const body = source.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "").trim();
 return language.startsWith("ko") && path === "SKILL.md" && entry?.source === body ? entry.body : source;
}
