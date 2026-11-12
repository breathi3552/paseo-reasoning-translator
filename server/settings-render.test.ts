import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { URL } from "node:url";
import { setImmediate as tick } from "node:timers/promises";
import test from "node:test";
import { transpileModule, ModuleKind, JsxEmit, ScriptTarget } from "typescript";
import * as rpc from "../shared/rpc";
import {
  DEFAULT_CONNECTION,
  type ConnectionMetadata,
  type SaveConnectionInput,
} from "../shared/connection";
import { DEFAULT_SETTINGS, type TranslationSettings } from "../shared/settings";

function settingsHarness(options: { language?: string } = {}) {
  const language = options.language ?? "zh-CN";
  const require = createRequire(import.meta.url);
  const slots: any[] = [];
  let cursor = 0;
  let dirty = false;
  let effects: Array<() => void> = [];
  let metadata: ConnectionMetadata = { ...DEFAULT_CONNECTION, hasApiKey: true, revision: "c1" };
  let connectionError = false;
  let settingsValues: TranslationSettings = { ...DEFAULT_SETTINGS };
  let settingsRevision = "s1";
  let fail = false;
  const saves: SaveConnectionInput[] = [];
  const savedSettings: Array<{ values: TranslationSettings; revision: string }> = [];
  const cache: unknown[] = [];
  const errors: string[] = [];

  function useState(initial: any) {
    const slot = cursor++;
    if (!(slot in slots)) slots[slot] = initial;
    return [
      slots[slot],
      (value: any) => {
        slots[slot] = typeof value === "function" ? value(slots[slot]) : value;
        dirty = true;
      },
    ];
  }

  const modules: Record<string, unknown> = {
    react: {
      useState,
      useRef: (value: any) => useState({ current: value })[0],
      useMemo: (fn: () => any) => fn(),
      createContext: (defaultValue: unknown) => ({ _currentValue: defaultValue }),
      useContext: (ctx: any) => ctx?._currentValue ?? null,
      useEffect: (fn: () => void, deps: unknown[]) => {
        const slot = cursor++;
        if (!slots[slot] || deps.some((value, index) => !Object.is(value, slots[slot][index]))) {
          slots[slot] = deps;
          effects.push(fn);
        }
      },
    },
    "react-native": {
      Pressable: "Pressable",
      ScrollView: "ScrollView",
      View: "View",
      Text: "Text",
      StyleSheet: { create: (styles: unknown) => styles },
    },
    "@getpaseo/plugin/client": {
      useSettings: () => ({
        status: "ready",
        revision: settingsRevision,
        values: settingsValues,
        saving: false,
        saveError: null,
        save: async (values: TranslationSettings, revision: string) => {
          savedSettings.push({ values, revision });
          settingsValues = values;
          settingsRevision = `${revision}-next`;
          dirty = true;
          return true;
        },
        reset: async () => true,
        reload: async () => {},
      }),
      useRpc: (contract: any) => async (input: SaveConnectionInput) => {
        if (contract.name === rpc.clearTranslationCache.name) {
          return { cleared: 2 };
        }
        assert.equal(contract.name, rpc.saveConnection.name);
        saves.push(input);
        if (fail) return { status: "conflict", error: "连接保存冲突，请重新加载" };
        metadata = {
          format: input.format,
          baseUrl: input.baseUrl,
          model: input.model,
          hasApiKey: input.key.action === "delete" ? false : input.key.action === "replace" ? true : metadata.hasApiKey,
          revision: "c-new",
        };
        return { status: "saved", connection: metadata };
      },
    },
    "@tanstack/react-query": {
      useQueryClient: () => ({
        setQueryData: (_: unknown, value: unknown) => {
          cache.push(value);
        },
        invalidateQueries: async () => {},
      }),
    },
    "@getpaseo/plugin/client/ui": Object.fromEntries([
      ...[
        "Icon",
        "Loading",
        "SettingsAction",
        "SettingsCard",
        "SettingsInput",
        "SettingsRow",
        "SettingsSection",
        "SettingsSelect",
        "SettingsSwitch",
      ].map((name) => [name, name]),
      ["useToast", () => ({ error: (message: string) => errors.push(message), show: () => {} })],
    ]),
    "./connection": {
      useConnection: () => ({
        status: connectionError ? "error" : "success",
        data: connectionError ? undefined : metadata,
        isPending: false,
        isError: connectionError,
        isFetching: false,
        refetch: async () => ({
          data: connectionError ? undefined : metadata,
          isError: connectionError,
        }),
      }),
    },
  };

  function loadModule(relPath: string, fileName: string) {
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
    new Function("require", "exports", compiled)((id: string) => modules[id] ?? require(id), modExports);
    return modExports;
  }

  modules["./i18n"] = loadModule("../client/i18n.tsx", "i18n.tsx");
  const exports = loadModule("../client/settings.tsx", "settings.tsx");

  function render() {
    const element = exports.TranslationSettingsScreen({
      host: { id: "h", language },
      theme: { colors: {} },
      layout: { compact: true },
    });
    let tree: any;
    let attempts = 0;
    do {
      assert.ok(++attempts < 12, "effects must settle");
      cursor = 0;
      dirty = false;
      effects = [];
      tree = element.type(element.props);
      for (const effect of effects) effect();
    } while (dirty);
    return tree;
  }

  return {
    render,
    saves,
    savedSettings,
    cache,
    errors,
    setFail: (value: boolean) => {
      fail = value;
    },
    setConnectionError: (value: boolean) => {
      connectionError = value;
    },
    updateMetadata: (patch: Partial<ConnectionMetadata>) => {
      metadata = { ...metadata, ...patch };
    },
  };
}

function find(node: any, label: string): any {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map((child) => find(child, label)).find(Boolean);
  if (node.props?.label === label || node.props?.accessibilityLabel === label) return node;
  return find(node.props?.children, label);
}

function collectText(node: any): string {
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object") return "";
  if (Array.isArray(node)) return node.map(collectText).join(" ");
  return [collectText(node.props?.trailing), collectText(node.props?.children)].filter(Boolean).join(" ");
}

async function settle() {
  for (let i = 0; i < 5; i++) await tick();
}

test("actual settings form masks key, retains it on conflict and clears it after success without caching it", async () => {
  const h = settingsHarness();
  let tree = h.render();
  assert.equal(find(tree, "API Key").props.secureTextEntry, true);
  find(tree, "API Key").props.onChangeText("offline-input-secret");
  h.setFail(true);
  tree = h.render();
  const inputKey = find(tree, "API Key").key;
  find(tree, "保存连接").props.onPress();
  await settle();
  assert.equal(h.saves[0].key.action, "replace");
  tree = h.render();
  assert.equal(find(tree, "API Key").key, inputKey);
  h.setFail(false);
  find(tree, "保存连接").props.onPress();
  await settle();
  tree = h.render();
  assert.deepEqual(h.saves[1].key, { action: "replace", value: "offline-input-secret" });
  assert.notEqual(find(tree, "API Key").key, inputKey);
  assert.equal(find(tree, "API Key").props.initialValue, "");
  assert.equal(JSON.stringify(h.cache).includes("offline-input-secret"), false);
  assert.equal(JSON.stringify(h.errors).includes("offline-input-secret"), false);
});

test("edited form keeps its expected revision, and changing target requires freshly entered key", async () => {
  const h = settingsHarness();
  let tree = h.render();
  find(tree, "模型 ID").props.onChangeText("edited-model");
  h.updateMetadata({ revision: "c2", model: "external-model" });
  tree = h.render();
  find(tree, "保存连接").props.onPress();
  await settle();
  assert.equal(h.saves[0].expectedRevision, "c1");
  assert.deepEqual(h.saves[0].key, { action: "keep" });
  tree = h.render();
  find(tree, "API Key").props.onChangeText("key-for-old-target");
  tree = h.render();
  find(tree, "Base URL").props.onChangeText("https://new.example/v1beta");
  tree = h.render();
  find(tree, "保存连接").props.onPress();
  await settle();
  assert.equal(h.saves.length, 1);
  tree = h.render();
  find(tree, "API Key").props.onChangeText("fresh-key-for-new-target");
  tree = h.render();
  find(tree, "保存连接").props.onPress();
  await settle();
  assert.deepEqual(h.saves[1].key, { action: "replace", value: "fresh-key-for-new-target" });
});

test("daily settings, key deletion, and on-demand details stay concise until needed", async () => {
  const h = settingsHarness();
  let tree = h.render();

  assert.equal(collectText(tree).includes("已配置"), true);
  assert.equal(
    find(tree, "翻译方式").props.hint,
    "手动模式仅翻译点击的思考块；自动模式翻译已加载的完整思考",
  );
  assert.equal(find(tree, "API Key").props.placeholder, "已保存（留空保留，输入则替换）");
  assert.equal(find(tree, "API Key").props.hint, undefined);

  // Target language save action only appears when modified
  assert.equal(find(tree, "保存目标语言"), undefined);
  find(tree, "目标语言").props.onChangeText("English");
  tree = h.render();
  assert.ok(find(tree, "保存目标语言"));
  find(tree, "保存目标语言").props.onPress();
  await settle();
  tree = h.render();
  assert.equal(h.savedSettings[0].values.targetLanguage, "English");
  assert.equal(find(tree, "保存目标语言"), undefined);

  // Secondary details are collapsed by default and expand on press
  assert.equal(collectText(tree).includes("请求范围"), false);
  find(tree, "说明与限制").props.onPress();
  tree = h.render();
  assert.equal(collectText(tree).includes("请求范围"), true);

  // Saved key can be deleted directly without a separate mode selector
  find(tree, "删除已保存密钥").props.onPress();
  await settle();
  tree = h.render();
  assert.deepEqual(h.saves[0].key, { action: "delete" });
  assert.equal(find(tree, "删除已保存密钥"), undefined);

  // Connection read failure shows matching reload label instead of discard-edits label
  h.setConnectionError(true);
  tree = h.render();
  assert.ok(find(tree, "重新读取连接"));
  assert.equal(find(tree, "放弃未保存更改"), undefined);
});

test("settings form renders English UI and localizes server errors when host language is en", async () => {
  const h = settingsHarness({ language: "en" });
  let tree = h.render();

  assert.equal(collectText(tree).includes("Configured"), true);
  assert.equal(
    find(tree, "Translation mode").props.hint,
    "Manual mode translates only clicked blocks; automatic mode translates completed reasoning",
  );
  assert.equal(
    find(tree, "API Key").props.placeholder,
    "Saved (leave blank to keep, or enter to replace)",
  );

  find(tree, "Notes & Limits").props.onPress();
  tree = h.render();
  assert.equal(collectText(tree).includes("Request scope"), true);

  h.setFail(true);
  find(tree, "API Key").props.onChangeText("new-secret");
  tree = h.render();
  find(tree, "Save connection").props.onPress();
  await settle();
  tree = h.render();
  assert.equal(
    collectText(tree).includes("Connection configuration was updated (save conflict). Reload before saving."),
    true,
  );
});
