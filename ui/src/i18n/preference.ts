export const LANGUAGE_STORAGE_KEY = "paperclip.displayLanguage";
export type DisplayLanguage = "en" | "ko";

export function readDisplayLanguage(storage?: Pick<Storage, "getItem">): DisplayLanguage {
  try {
    const saved = storage?.getItem(LANGUAGE_STORAGE_KEY);
    return saved === "en" || saved === "ko" ? saved : "ko";
  } catch {
    return "ko";
  }
}

export function saveDisplayLanguage(language: DisplayLanguage, storage?: Pick<Storage, "setItem">): boolean {
  try {
    if (!storage) return false;
    storage.setItem(LANGUAGE_STORAGE_KEY, language);
    return true;
  } catch {
    return false;
  }
}
