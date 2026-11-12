import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { URL } from "node:url";
import test from "node:test";
import { transpileModule, ModuleKind, JsxEmit, ScriptTarget } from "typescript";
import {
  detectPaseoLanguage,
  localizeServerError,
  t,
  translations,
} from "../client/i18n";

let storageLanguage = "en";
let browserLanguages = ["en-US"];
let browserLanguage = "en-US";
let documentLanguage = "en";

test("zh and en dictionaries have identical keys and matching placeholders", () => {
  const zhKeys = Object.keys(translations.zh).sort();
  const enKeys = Object.keys(translations.en).sort();
  assert.deepEqual(zhKeys, enKeys);

  const placeholders = (text: string) =>
    [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  for (const key of zhKeys) {
    const k = key as keyof typeof translations.zh;
    assert.deepEqual(
      placeholders(translations.zh[k]),
      placeholders(translations.en[k]),
      `Placeholders mismatch for ${key}`,
    );
  }
});

test("detects language from Paseo app-settings, browser navigator, document, and host props", (t) => {
  const g = globalThis as any;
  const origLocalStorage = g.localStorage;
  const origNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const origDocument = g.document;

  g.localStorage = {
    getItem(key: string) {
      return key === "@paseo:app-settings"
        ? JSON.stringify({ language: storageLanguage })
        : null;
    },
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    get: () => ({ language: browserLanguage, languages: browserLanguages }),
  });
  g.document = {
    get documentElement() {
      return { lang: documentLanguage };
    },
  };

  t.after(() => {
    if (origLocalStorage === undefined) delete g.localStorage;
    else g.localStorage = origLocalStorage;
    if (origNavigator) Object.defineProperty(globalThis, "navigator", origNavigator);
    else delete g.navigator;
    if (origDocument === undefined) delete g.document;
    else g.document = origDocument;
  });

  const require = createRequire(import.meta.url);
  const modules: Record<string, unknown> = {
    react: {
      createContext: (d: unknown) => ({ _currentValue: d }),
      useContext: (c: any) => c?._currentValue ?? null,
      useMemo: (fn: () => unknown) => fn(),
    },
    "@getpaseo/plugin/client": {},
    "@getpaseo/plugin/client/ui": { SidebarRow: "SidebarRow" },
    "./shared/timeline": {
      REASONING_KIND: "reasoning",
      REASONING_VERSION: 1,
      reasoningDataSchema: {},
    },
    "./client/timeline": { TranslatedReasoning: "TranslatedReasoning" },
    "./client/settings": { TranslationSettingsScreen: "TranslationSettingsScreen" },
  };

  function loadTsx(relPath: string, fileName: string) {
    const source = readFileSync(new URL(relPath, import.meta.url), "utf8");
    const compiled = transpileModule(source, {
      fileName,
      compilerOptions: {
        module: ModuleKind.CommonJS,
        jsx: JsxEmit.ReactJSX,
        target: ScriptTarget.ES2020,
      },
    }).outputText;
    const modExports: any = {};
    new Function("require", "exports", compiled)(
      (id: string) => modules[id] ?? require(id),
      modExports,
    );
    return modExports;
  }

  modules["./i18n"] = loadTsx("../client/i18n.tsx", "i18n.tsx");
  modules["./client/i18n"] = modules["./i18n"];
  modules["./client/sidebar"] = loadTsx("../client/sidebar.tsx", "sidebar.tsx");
  const clientEntry = loadTsx("../index.client.tsx", "index.client.tsx");

  for (const [setting, browser, doc, expectedSettings, expectedScreen, expectedCommand] of [
    ["en", ["zh-CN"], "zh-CN", "Thinking Translation Settings", "Thinking Translation", "Open Thinking Translation Settings"],
    ["zh-Hans", ["en-US"], "en", "思考翻译设置", "思考翻译", "打开思考翻译设置"],
    ["zh-TW", ["en-US"], "en", "思考翻译设置", "思考翻译", "打开思考翻译设置"],
    ["system", ["zh-HK", "en-US"], "en", "思考翻译设置", "思考翻译", "打开思考翻译设置"],
    ["system", ["fr-FR"], "zh-CN", "Thinking Translation Settings", "Thinking Translation", "Open Thinking Translation Settings"],
  ] as const) {
    storageLanguage = setting;
    browserLanguages = [...browser];
    browserLanguage = browser[0];
    documentLanguage = doc;

    let registeredSettings: any;
    let registeredScreen: any;
    let registeredSidebar: any;
    let registeredCommand: any;

    clientEntry.default({
      addTimelineTransformer() {},
      addTimelineRenderer() {},
      addSettingsScreen(c: any) { registeredSettings = c; },
      addScreen(c: any) { registeredScreen = c; },
      addSidebarHeaderItem(c: any) { registeredSidebar = c; },
      addCommandCenterItem(c: any) { registeredCommand = c; },
    });

    assert.equal(registeredSettings.title, expectedSettings);
    assert.equal(registeredScreen.title, expectedScreen);
    assert.equal(registeredSidebar.title, expectedScreen);
    assert.equal(registeredCommand.title, expectedCommand);

    const sidebarTree = registeredSidebar.Component({
      host: { id: "h", label: "H" },
      theme: { colors: {} },
      layout: { compact: false, platform: "web" },
      currentScreen: null,
      openScreen() {},
      openPopover() {},
    });
    assert.equal(sidebarTree.props.label, expectedScreen);
  }

  // Direct host prop overrides storage/navigator
  assert.equal(detectPaseoLanguage({ locale: "en-US" }), "en");
  assert.equal(detectPaseoLanguage({ host: { language: "zh-CN" } }), "zh");
});

test("server errors localize to English when language is en and preserve Chinese when zh", () => {
  assert.equal(
    localizeServerError("连接配置已更新（保存冲突），请重新加载后再保存", "en"),
    "Connection configuration was updated (save conflict). Reload before saving.",
  );
  assert.equal(
    localizeServerError("API key 无效或已过期（HTTP 401）", "en"),
    "API key is invalid or expired (HTTP 401)",
  );
  assert.equal(
    localizeServerError("翻译 HTTP 请求失败（状态 418）", "en"),
    "Translation HTTP request failed (status 418)",
  );
  assert.equal(
    localizeServerError("API key 无效或已过期（HTTP 401）", "zh"),
    "API key 无效或已过期（HTTP 401）",
  );
  assert.equal(
    t("settings.cache.clearedToast", "en", { count: 3 }),
    "Cleared 3 cached entries",
  );
});
