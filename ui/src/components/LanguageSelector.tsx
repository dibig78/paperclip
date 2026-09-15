import { useState } from "react";
import { i18n, useTranslation } from "@/i18n";
import { saveDisplayLanguage, type DisplayLanguage } from "@/i18n/preference";

/** Reload after switching so module-level labels and breadcrumbs update too. */
export function LanguageSelector() {
  const { t } = useTranslation();
  const [error, setError] = useState(false);
  function change(language: DisplayLanguage) {
    let saved = false;
    try { saved = saveDisplayLanguage(language, window.localStorage); } catch { /* denied storage */ }
    if (!saved) { setError(true); return; }
    void i18n.changeLanguage(language).then(() => window.location.reload());
  }
  return (
    <div className="px-3 py-2 text-sm">
      <label className="flex flex-wrap items-center gap-2">
        <span>{t("ui.language")}</span>
        <select aria-label={t("ui.language")} value={i18n.language} onChange={(e) => change(e.target.value as DisplayLanguage)} className="rounded border border-border bg-background px-2 py-1">
          <option value="ko">한국어</option>
          <option value="en">English</option>
        </select>
      </label>
      {error && <p role="alert">언어를 저장할 수 없습니다. / Unable to save language.</p>}
    </div>
  );
}
