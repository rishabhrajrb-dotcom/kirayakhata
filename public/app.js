import { STRINGS, SUPPORTED, DEFAULT_LANG } from "./i18n.js";
import { initDemo } from "./demo.js";

const STORAGE_KEY = "kk.lang";

function readSavedLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED.includes(saved) ? saved : null;
  } catch {
    return null;
  }
}

function saveLang(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage can be blocked (private mode); the toggle still works for this visit.
  }
}

export function applyLanguage(lang) {
  const dict = STRINGS[lang] || STRINGS[DEFAULT_LANG];
  document.documentElement.lang = lang;

  for (const el of document.querySelectorAll("[data-i18n]")) {
    const text = dict[el.dataset.i18n];
    if (text !== undefined) el.textContent = text;
  }
  for (const el of document.querySelectorAll("[data-i18n-aria]")) {
    const text = dict[el.dataset.i18nAria];
    if (text !== undefined) el.setAttribute("aria-label", text);
  }

  // The toggle always offers the *other* language, written in that language.
  const toggle = document.getElementById("lang-toggle");
  if (toggle) {
    toggle.textContent = dict["lang.switch"];
    toggle.setAttribute("aria-label", dict["lang.switchLabel"]);
    toggle.lang = lang === "hi" ? "en" : "hi";
  }
  document.dispatchEvent(new CustomEvent("kk:lang", { detail: { lang } }));
}

function init() {
  initDemo();
  let lang = readSavedLang() || DEFAULT_LANG;
  if (lang !== DEFAULT_LANG) applyLanguage(lang);

  document.getElementById("lang-toggle")?.addEventListener("click", () => {
    lang = lang === "hi" ? "en" : "hi";
    applyLanguage(lang);
    saveLang(lang);
  });
}

init();
