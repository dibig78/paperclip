import { describe, expect, it } from "vitest";
import { localizedSkillBody } from "./skill-display";
import translations from "./skill-display-data.json";
const agentmail = translations.agentmail.source;
describe("skill display translations", () => {
 it("translates the bundled AgentMail preview without touching source", () => {
  expect(localizedSkillBody("agentmail", "SKILL.md", agentmail, "ko")).toContain("네이티브 실행기는");
 });
 it("preserves English, unrelated files and changed source", () => {
  for (const [path, source, language] of [["SKILL.md",agentmail,"en"],["references/api.md",agentmail,"ko"],["SKILL.md","custom text","ko"]]) {
   expect(localizedSkillBody("agentmail",path,source,language)).toBe(source);
  }
 });
});
