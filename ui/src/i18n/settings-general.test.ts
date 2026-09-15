import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { t } from ".";
import en from "./locales/en.json";
import ko from "./locales/ko.json";

const source = readFileSync(new URL("../pages/InstanceGeneralSettings.tsx", import.meta.url), "utf8");

describe("general settings translations", () => {
  it("has no untranslated JSX text or accessibility labels", () => {
    expect(source).not.toMatch(/>\s*[A-Za-z][^<{]*</);
    expect(source).not.toMatch(/(?:aria-label|label)="[A-Za-z]/);
    expect(source).not.toMatch(/"(?:Failed to |Ready|Not ready|Always allow|Don't allow|Signing out)/);
  });

  it("resolves every general settings key in English and Korean", () => {
    const keys = [...source.matchAll(/t\("(ui\.general_settings_[^"]+)"/g)].map((match) => match[1]);
    expect(keys.length).toBeGreaterThan(30);
    for (const key of keys) {
      const name = key.slice(3);
      for (const [lng, messages] of [["en", en], ["ko", ko]] as const) {
        const value = (messages.ui as Record<string, string>)[name];
        expect(value, `${lng}: ${key}`).toBeTruthy();
        expect(t(key, { lng, count: 2, topics: "test" })).not.toBe(key);
        if (lng === "ko") expect(value).toMatch(/[가-힣]/);
      }
    }
  });

  it("formats retention counts with English plurals and Korean units", () => {
    expect(t("ui.general_settings_weeks", { lng: "en", count: 1 })).toBe("1 week");
    expect(t("ui.general_settings_weeks", { lng: "en", count: 4 })).toBe("4 weeks");
    expect(t("ui.general_settings_months", { lng: "ko", count: 1 })).toBe("1개월");
    expect(t("ui.general_settings_days", { lng: "ko", count: 7 })).toBe("7일");
  });
});
