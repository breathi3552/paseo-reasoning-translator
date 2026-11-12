import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { URL } from "node:url";
import test from "node:test";
import { transpileModule, ModuleKind, JsxEmit, ScriptTarget } from "typescript";
import * as queries from "../shared/translation-query";
import * as settings from "../shared/settings";
import * as rpc from "../shared/rpc";
import { DEFAULT_CONNECTION } from "../shared/connection";
import { TranslationService } from "./translation-service";
import { createHttpTranslator, type HttpResponse } from "./http-translator";
import { MemorySettings, MemoryConnection, until } from "./test-helpers";

function timelineHarness(options: { rpc?: (contract: any, input: any) => Promise<unknown>; language?: string } = {}) {
  const language = options.language ?? "zh-CN";
  const require = createRequire(import.meta.url);
  let slots: unknown[] = [];
  let cursor = 0;
  let dirty = false;
  let mounts = 0;
  let previous: any;
  let tree: any;
  let queryOptions: any[] = [];
  const cached = new Map<string, rpc.TranslationJob>();
  const saved = {
    status: "ready",
    revision: "1",
    values: settings.settingsSchema.parse({ enabled: true }),
  };
  const connection = { ...DEFAULT_CONNECTION, hasApiKey: true, revision: "c1" };

  function useState<T>(initial: T) {
    const slot = cursor++;
    if (!(slot in slots)) slots[slot] = initial;
    return [
      slots[slot],
      (next: T | ((value: T) => T)) => {
        slots[slot] = typeof next === "function" ? (next as (value: T) => T)(slots[slot] as T) : next;
        dirty = true;
      },
    ] as const;
  }

  const modules: Record<string, unknown> = {
    react: {
      useState,
      useRef: (value: unknown) => useState({ current: value })[0],
      useMemo: (compute: () => unknown) => compute(),
      useCallback: (fn: unknown) => fn,
      createContext: (defaultValue: unknown) => ({ _currentValue: defaultValue }),
      useContext: (ctx: any) => ctx?._currentValue ?? null,
    },
    "react-native": {
      View: "View",
      Text: "Text",
      Pressable: "Pressable",
      ScrollView: "ScrollView",
      StyleSheet: { create: (styles: unknown) => styles },
    },
    "@getpaseo/plugin/client": {
      useSettings: () => saved,
      useRpc: (contract: unknown) => async (input: unknown) => {
        if (options.rpc) return options.rpc(contract, input);
        throw new Error("Rendering must not call RPC");
      },
    },
    "@getpaseo/plugin/client/ui": { Icon: "Icon", Markdown: "Markdown", StreamedText: "StreamedText" },
    "@tanstack/react-query": {
      useQuery: (opts: any) => {
        queryOptions.push(opts);
        return { data: cached.get(opts.queryKey[0]), isFetching: false, isError: false };
      },
    },
    "./connection": { useConnection: () => ({ status: "success", data: connection }) },
    "../shared/settings": settings,
    "../shared/rpc": rpc,
    "../shared/translation-query": queries,
  };

  function loadModule(relPath: string, fileName: string) {
    const modExports: any = {};
    const source = readFileSync(new URL(relPath, import.meta.url), "utf8");
    const compiled = transpileModule(source, {
      fileName,
      compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, target: ScriptTarget.ES2020 },
    }).outputText;
    new Function("require", "exports", compiled)((id: string) => modules[id] ?? require(id), modExports);
    return modExports;
  }

  modules["./i18n"] = loadModule("../client/i18n.tsx", "i18n.tsx");
  const exports = loadModule("../client/timeline.tsx", "timeline.tsx");

  function render(text: string, phase: "streaming" | "complete" = "complete", identity: any = {}) {
    const element = exports.TranslatedReasoning({
      host: { id: "host", language },
      agentId: "agent",
      ...identity,
      ...(identity.host ? { host: { language, ...identity.host } } : {}),
      item: { data: { text, phase } },
      theme: { colors: {} },
      layout: { compact: true },
    });
    if (!previous || previous.type !== element.type || previous.key !== element.key) {
      slots = [];
      mounts++;
    }
    previous = element;
    let attempts = 0;
    do {
      assert.ok(++attempts < 10, "render-phase state adjustment must settle");
      cursor = 0;
      dirty = false;
      queryOptions = [];
      tree = element.type(element.props);
    } while (dirty);
    return { element, tree, mounts, submit: queryOptions[0], poll: queryOptions[1] };
  }

  return { render, saved, cached, connection };
}

function find(node: any, match: (node: any) => boolean): any {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map((child) => find(child, match)).find(Boolean);
  return match(node) ? node : find(node.props?.children, match);
}

const control = (tree: any, label: string) => find(tree, (node) => node.props?.accessibilityLabel === label);

test("streams expanded, auto-collapses on completion without remounting, and toggles via header", () => {
  const h = timelineHarness();

  const streaming = h.render("Thinking...", "streaming");
  assert.ok(find(streaming.tree, (node) => node.type === "StreamedText"));
  assert.ok(control(streaming.tree, "折叠思考内容"));

  const complete = h.render("Thinking complete", "complete");
  assert.equal(complete.mounts, 1);
  assert.equal(complete.submit.enabled, false);
  assert.equal(find(complete.tree, (node) => node.type === "StreamedText"), undefined);

  const expandHeader = control(complete.tree, "展开思考内容");
  assert.ok(expandHeader);
  expandHeader.props.onPress();

  const expanded = h.render("Thinking complete", "complete");
  assert.ok(control(expanded.tree, "折叠思考内容"));
  assert.ok(find(expanded.tree, (node) => node.type === "Text" && node.props?.children === "Thinking complete"));
});

test("manual click translates end-to-end, toggles original/translation in-place, retranslates, and revokes on change", async (t) => {
  let requests = 0;
  const runner = createHttpTranslator({
    fetch: async () => {
      requests++;
      return new Response(
        JSON.stringify({
          candidates: [{
            finishReason: "STOP",
            content: {
              role: "model",
              parts: [
                { thought: true, text: "private thought" },
                { text: requests === 1 ? "**HTTP 译文**" : "**重翻译文**" },
              ],
            },
          }],
        }),
      ) as unknown as HttpResponse;
    },
  });
  const connections = new MemoryConnection();
  const service = new TranslationService(new MemorySettings(), connections, { runner });
  t.after(() => service.close());

  const h = timelineHarness({
    rpc: async (contract, input) =>
      contract.name === rpc.submitTranslation.name ? service.submit(input) : service.get(input.jobId),
  });
  h.connection.revision = connections.value.revision;

  // 1. Expand and click Translate
  const initial = h.render("source");
  assert.equal(initial.submit.enabled, false);
  control(initial.tree, "展开思考内容").props.onPress();
  control(h.render("source").tree, "翻译此思考块").props.onPress();

  const clicked = h.render("source");
  h.cached.set("translation-submit", await clicked.submit.queryFn());
  const pending = h.render("source");
  await until(async () => {
    const result = await pending.poll.queryFn();
    h.cached.set("translation-job", result);
    return result.status === "ready";
  });

  // 2. Renders translated Markdown and toggles to raw source and back
  const readyView = h.render("source");
  assert.equal(find(readyView.tree, (node) => node.type === "Markdown").props.children, "**HTTP 译文**");

  control(readyView.tree, "显示原文").props.onPress();
  const showingOriginal = h.render("source");
  assert.equal(find(showingOriginal.tree, (node) => node.type === "Markdown"), undefined);
  assert.ok(find(showingOriginal.tree, (node) => node.type === "Text" && node.props?.children === "source"));

  // 3. Explicit retranslate requests a fresh translation
  control(showingOriginal.tree, "重新翻译此思考块").props.onPress();
  const retranslating = h.render("source");
  h.cached.delete("translation-job");
  h.cached.set("translation-submit", await retranslating.submit.queryFn());
  const retranslatePoll = h.render("source");
  await until(async () => {
    const result = await retranslatePoll.poll.queryFn();
    h.cached.set("translation-job", result);
    return result.status === "ready";
  });
  assert.equal(requests, 2);

  control(h.render("source").tree, "显示译文").props.onPress();
  assert.equal(find(h.render("source").tree, (node) => node.type === "Markdown").props.children, "**重翻译文**");

  // 4. Changing source text or connection revokes manual authorization
  assert.equal(h.render("modified source").submit.enabled, false);
  connections.change({ model: "new-model" });
  h.connection.revision = connections.value.revision;
  h.cached.clear();
  assert.equal(h.render("source").submit.enabled, false);
});

test("confines diagnostics to expanded view and localizes UI and server errors in English", () => {
  const overlimitText = "A".repeat(rpc.MAX_SOURCE_CHARS + 10);
  const zh = timelineHarness();
  const collapsed = zh.render(overlimitText, "complete");
  assert.equal(
    find(collapsed.tree, (node) => node.type === "Text" && String(node.props?.children ?? "").includes("思考文本超出上限")),
    undefined,
  );
  control(collapsed.tree, "展开思考内容").props.onPress();
  const expandedZh = zh.render(overlimitText, "complete");
  assert.ok(
    find(expandedZh.tree, (node) => {
      if (node.type !== "Text") return false;
      const text = Array.isArray(node.props?.children) ? node.props.children.join("") : String(node.props?.children ?? "");
      return text.includes("思考文本超出上限");
    }),
  );

  const en = timelineHarness({ language: "en" });
  const completeEn = en.render("Completed thought", "complete");
  control(completeEn.tree, "Expand thinking content").props.onPress();
  const expandedEn = en.render("Completed thought", "complete");
  en.cached.set("translation-submit", {
    jobId: "err-1",
    status: "error",
    translatedText: null,
    targetLanguage: "English",
    reason: null,
    error: "API key 无效或已过期（HTTP 401）",
  });
  control(expandedEn.tree, "Translate this thinking block").props.onPress();
  const erroredEn = en.render("Completed thought", "complete");
  assert.ok(control(erroredEn.tree, "Retry translation"));
  assert.ok(
    find(
      erroredEn.tree,
      (node) =>
        node.type === "Text" &&
        Array.isArray(node.props?.children) &&
        node.props.children.join("").includes("API key is invalid or expired (HTTP 401)"),
    ),
  );
});
