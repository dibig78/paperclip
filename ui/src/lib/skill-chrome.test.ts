import { describe, it, expect } from "vitest";
import { skillLabel, skillLabels } from "./skill-chrome";
import { localizedSkillBody } from "./skill-display";
import data from "./skill-display-data.json";
describe("shared skill display", () => {
 it.each(Object.entries(skillLabels))("localizes %s with English fallback", (source, ko) => {expect(skillLabel(source,"ko")).toBe(ko);expect(skillLabel(source,"en")).toBe(source);});
 it.each(Object.entries(data))("guards original body for %s across display paths", (slug, entry) => {expect(localizedSkillBody(slug,"SKILL.md",entry.source,"ko")).toBe(entry.body);expect(localizedSkillBody(slug,"SKILL.md",entry.source+" changed","ko")).toBe(entry.source+" changed");expect(localizedSkillBody(slug,"raw.md",entry.source,"ko")).toBe(entry.source);});
});
