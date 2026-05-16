// i18n.js - dynamic language loader (languages/*.json)
(function () {
  "use strict";

  const STORAGE_KEY = "ffv_lang";
  const FALLBACK_LANG = "en";

  const dictionaries = new Map();
  let availableLanguages = [{ code: FALLBACK_LANG, file: `${FALLBACK_LANG}.json` }];
  let currentLanguage = FALLBACK_LANG;

  const fallbackCore = {
    btn_lang_title: "Select language",
    player_shuffle_on: "🔀 Shuffle: On",
    player_shuffle_off: "🔀 Shuffle: Off",
    player_select_book: "Select a book",
    player_section_label: "Section",
    player_track_label: "Track",
    player_no_books_in: "No audiobooks found in {{path}}",
    player_no_results_for: "No results for \"{{query}}\"",
    player_tracks_count: "{{n}} tracks",
    player_scan_error: "Player scan error: {{msg}}",
    player_start_timer: "Start timer",
    player_cancel_timer: "Cancel timer",
    player_sleep_not_active: "not active",
    player_sleep_left: "left {{time}}",
    player_sleep_elapsed: "Sleep timer elapsed. Playback stopped.",
    player_play: "▶ Play",
    player_pause: "⏸ Pause"
  };

  dictionaries.set(FALLBACK_LANG, fallbackCore);

  function normalizeLangCode(value) {
    return String(value || "").trim().toLowerCase();
  }

  function interpolate(template, params) {
    let result = String(template);
    for (const [key, value] of Object.entries(params || {})) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
    }
    return result;
  }

  function t(key, params) {
    const dict = dictionaries.get(currentLanguage) || {};
    const fallback = dictionaries.get(FALLBACK_LANG) || {};
    const raw = Object.prototype.hasOwnProperty.call(dict, key)
      ? dict[key]
      : (Object.prototype.hasOwnProperty.call(fallback, key) ? fallback[key] : key);
    return interpolate(raw, params || {});
  }

  function getLang() {
    return currentLanguage;
  }

  function getAvailableLanguages() {
    return [...availableLanguages];
  }

  function guessLanguageName(code) {
    try {
      const display = new Intl.DisplayNames([currentLanguage, "en"], { type: "language" });
      return display.of(code) || code.toUpperCase();
    } catch (_) {
      return code.toUpperCase();
    }
  }

  async function loadLanguage(code) {
    const normalized = normalizeLangCode(code);
    if (!normalized) return false;
    if (dictionaries.has(normalized) && normalized !== FALLBACK_LANG) return true;
    if (!window.api?.i18nReadLanguage) {
      console.warn('[i18n] window.api.i18nReadLanguage is missing - IPC bridge not loaded');
      return false;
    }

    try {
      const res = await window.api.i18nReadLanguage(normalized);
      if (!res || typeof res.translations !== "object" || Array.isArray(res.translations)) {
        console.warn('[i18n] loadLanguage(' + normalized + ') invalid response', res);
        return false;
      }
      dictionaries.set(normalized, res.translations);
      console.log('[i18n] loaded ' + normalized + ' (' + Object.keys(res.translations).length + ' keys)');
      return true;
    } catch (err) {
      console.warn('[i18n] loadLanguage(' + normalized + ') failed:', err && err.message ? err.message : err);
      return false;
    }
  }

  async function detectAvailableLanguages() {
    if (!window.api?.i18nListLanguages) {
      console.warn('[i18n] window.api.i18nListLanguages missing - using hardcoded fallback list [en, pl]');
      availableLanguages = [
        { code: 'en', file: 'en.json' },
        { code: 'pl', file: 'pl.json' }
      ];
      return;
    }
    try {
      const res = await window.api.i18nListLanguages();
      console.log('[i18n] listLanguages ->', JSON.stringify(res));
      const list = Array.isArray(res?.languages) ? res.languages : [];
      const filtered = list
        .map((x) => ({ code: normalizeLangCode(x?.code), file: String(x?.file || "") }))
        .filter((x) => /^[a-z]{2,3}(-[a-z]{2})?$/.test(x.code));

      if (!filtered.some((x) => x.code === FALLBACK_LANG)) {
        filtered.unshift({ code: FALLBACK_LANG, file: `${FALLBACK_LANG}.json` });
      }

      availableLanguages = filtered.length > 0
        ? filtered.sort((a, b) => a.code.localeCompare(b.code))
        : [
            { code: 'en', file: 'en.json' },
            { code: 'pl', file: 'pl.json' }
          ];
    } catch (err) {
      console.warn('[i18n] listLanguages failed:', err && err.message ? err.message : err);
      availableLanguages = [
        { code: 'en', file: 'en.json' },
        { code: 'pl', file: 'pl.json' }
      ];
    }
  }

  function applyTranslations() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      el.setAttribute("aria-label", t(el.dataset.i18nAria));
    });

    renderLanguageSwitcher();
  }

  function closeLanguageMenu() {
    const host = document.getElementById("lang-switcher");
    const menu = document.getElementById("lang-dropdown");
    if (!host || !menu) return;
    host.classList.remove("open");
    menu.hidden = true;
  }

  function openLanguageMenu() {
    const host = document.getElementById("lang-switcher");
    const menu = document.getElementById("lang-dropdown");
    if (!host || !menu) return;
    host.classList.add("open");
    menu.hidden = false;
  }

  function renderLanguageSwitcher() {
    const button = document.getElementById("btn-lang-switch");
    const current = document.getElementById("lang-current");
    const menu = document.getElementById("lang-dropdown");

    if (!button || !current || !menu) return;

    current.textContent = currentLanguage.toUpperCase();
    button.title = t("btn_lang_title");

    menu.innerHTML = availableLanguages.map((lang) => {
      const active = lang.code === currentLanguage;
      const label = guessLanguageName(lang.code);
      return `<button class="lang-menu-item${active ? " is-active" : ""}" type="button" data-lang-code="${lang.code}"><span>${lang.code.toUpperCase()}</span><small>${escapeHtml(label)}</small></button>`;
    }).join("");

    menu.querySelectorAll("[data-lang-code]").forEach((item) => {
      item.addEventListener("click", async () => {
        const code = item.getAttribute("data-lang-code") || FALLBACK_LANG;
        await setLang(code);
        closeLanguageMenu();
      });
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function setLang(lang, opts) {
    const options = opts || {};
    let next = normalizeLangCode(lang);
    if (!availableLanguages.some((x) => x.code === next)) {
      next = FALLBACK_LANG;
    }

    const loaded = await loadLanguage(next);
    if (!loaded && next !== FALLBACK_LANG) {
      next = FALLBACK_LANG;
      await loadLanguage(FALLBACK_LANG);
    }

    currentLanguage = next;
    localStorage.setItem(STORAGE_KEY, currentLanguage);
    document.documentElement.lang = currentLanguage;

    applyTranslations();

    if (!options.silent) {
      window.dispatchEvent(new CustomEvent("langchange", { detail: { lang: currentLanguage } }));
    }
  }

  function initLanguageUiEvents() {
    const button = document.getElementById("btn-lang-switch");
    const host = document.getElementById("lang-switcher");

    if (!button || !host) return;

    button.addEventListener("click", (evt) => {
      evt.stopPropagation();
      if (host.classList.contains("open")) closeLanguageMenu();
      else openLanguageMenu();
    });

    document.addEventListener("click", (evt) => {
      if (!host.contains(evt.target)) closeLanguageMenu();
    });

    document.addEventListener("keydown", (evt) => {
      if (evt.key === "Escape") closeLanguageMenu();
    });
  }

  async function initI18n() {
    await detectAvailableLanguages();
    await loadLanguage(FALLBACK_LANG);

    const saved = normalizeLangCode(localStorage.getItem(STORAGE_KEY));
    const preferred = saved || normalizeLangCode(navigator.language).slice(0, 2) || FALLBACK_LANG;
    const target = availableLanguages.some((x) => x.code === preferred) ? preferred : FALLBACK_LANG;

    initLanguageUiEvents();
    await setLang(target, { silent: true });
  }

  window.t = t;
  window.setLang = setLang;
  window.getLang = getLang;
  window.getAvailableLanguages = getAvailableLanguages;
  window.applyTranslations = applyTranslations;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initI18n);
  } else {
    initI18n();
  }
})();
