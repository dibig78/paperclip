import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { transformSync } from "esbuild";
import { t } from ".";
import en from "./locales/en.json";
import ko from "./locales/ko.json";

const profile = readFileSync(new URL("../pages/ProfileSettings.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../components/CompanySettingsSidebar.tsx", import.meta.url), "utf8");
const nav = readFileSync(new URL("../components/access/CompanySettingsNav.tsx", import.meta.url), "utf8");

describe("profile and settings navigation translations", () => {
  it("has no untranslated profile JSX, buttons, or fallback errors", () => {
    expect(profile).not.toMatch(/>\s*[A-Za-z][^<{]*</);
    expect(profile).not.toMatch(/"(?:Failed to |Select an organization|Change photo|Upload photo|Saving\.\.\.|Save profile|No email)/);
    expect(profile).toContain('aria-label={t("ui.profile_settings_upload_photo")}');
  });
  it("translates all static settings navigation labels", () => {
    expect(sidebar).not.toMatch(/label="[A-Za-z]/);
    expect(nav).not.toMatch(/label: "[A-Za-z]/);
    expect(nav).toContain('label: t(labelKey)');
  });
  it("resolves all profile keys in English and Korean", () => {
    const keys = [...profile.matchAll(/t\("(ui\.profile_settings_[^"]+)"/g)].map((m) => m[1]);
    expect(new Set(keys).size).toBe(16);
    for (const key of keys) {
      for (const [lng, messages] of [["en", en], ["ko", ko]] as const) {
        const value = (messages.ui as Record<string, string>)[key.slice(3)];
        expect(value, `${lng}: ${key}`).toBeTruthy();
        expect(t(key, { lng, company: "ACME" })).not.toBe(key);
        if (lng === "ko") expect(value).toMatch(/[가-힣]/);
      }
    }
  });
  it("interpolates organization names in storage guidance", () => {
    expect(t("ui.profile_settings_storage_hint", { lng: "ko", company: "ACME" })).toBe("ACME의 Paperclip 파일 저장소에 저장됩니다.");
    expect(t("ui.profile_settings_storage_hint", { lng: "en", company: "ACME" })).toBe("Stored in Paperclip file storage for ACME.");
  });
});
