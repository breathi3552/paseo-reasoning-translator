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

// Execute the actual TSX with host/RN adapters. The tiny hook driver models only
// state slots and React's type+key mount identity, not native layout or pacing.
function timelineHarness(options: { rpc?: (contract: any, input: any) => Promise<unknown> } = {}) {
  const require = createRequire(import.meta.url);
  let slots: unknown[] = [];
  let cursor = 0;
  let dirty = false;
  let mounts = 0;
  let previous: any;
  let tree: any;
  let queryOptions: any[] = [];
  const cached = new Map<string, rpc.TranslationJob>();
  const saved = { status: "ready", revision: "1", values: settings.settingsSchema.parse({
    enabled: true,
  }) };
  const connection = { ...DEFAULT_CONNECTION, hasApiKey: true, revision: "c1" };
  function useState<T>(initial: T) {
    const slot = cursor++;
    if (!(slot in slots)) slots[slot] = initial;
    return [slots[slot], (next: T | ((value: T) => T)) => {
      slots[slot] = typeof next === "function" ? (next as (value: T) => T)(slots[slot] as T) : next;
      dirty = true;
    }] as const;
  }
  const modules: Record<string, unknown> = {
    "react": {
      useState, useRef: (value: unknown) => useState({ current: value })[0],
      useMemo: (compute: () => unknown) => compute(), useCallback: (fn: unknown) => fn,
    },
    "react-native": {
      View: "View", Text: "Text", Pressable: "Pressable", StyleSheet: { create: (styles: unknown) => styles },
    },
    "@getpaseo/plugin/client": { useSettings: () => saved, useRpc: (contract: unknown) => async (input: unknown) => {
      if (options.rpc) return options.rpc(contract, input);
      throw new Error("Rendering must not call RPC");
    } },
    "@getpaseo/plugin/client/ui": { Icon: "Icon", Markdown: "Markdown", StreamedText: "StreamedText" },
    "@tanstack/react-query": { useQuery: (options: any) => {
      queryOptions.push(options);
      return { data: cached.get(options.queryKey[0]), isFetching: false, isError: false };
    } },
    "./connection": { useConnection: () => ({ status: "success", data: connection }) },
    "../shared/settings": settings, "../shared/rpc": rpc, "../shared/translation-query": queries,
  };
  const exports: any = {};
  const source = readFileSync(new URL("../client/timeline.tsx", import.meta.url), "utf8");
  const compiled = transpileModule(source, { fileName: "timeline.tsx", compilerOptions: {
    module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, target: ScriptTarget.ES2020,
  } }).outputText;
  new Function("require", "exports", compiled)((id: string) => modules[id] ?? require(id), exports);
  function render(text: string, phase: "streaming" | "complete" = "complete", identity = {}) {
    const element = exports.TranslatedReasoning({
      host: { id: "host" }, agentId: "agent", ...identity,
      item: { data: { text, phase } }, theme: { colors: {} }, layout: { compact: true },
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
function findAll(node: any, match: (node: any) => boolean): any[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, match));
  const current = match(node) ? [node] : [];
  return current.concat(findAll(node.props?.children, match));
}
const control = (tree: any, label: string) => find(tree, (node) => node.props?.accessibilityLabel === label);

test("actual timeline element retains mount identity and collapsed state across streamed appends and completion", () => {
  const h = timelineHarness();
  const first = h.render("A", "streaming");
  assert.ok(find(first.tree, (node) => node.type === "StreamedText"));
  const appended = h.render("A B", "streaming");
  assert.equal(appended.element.key, first.element.key);
  assert.equal(appended.element.type, first.element.type);
  assert.ok(find(appended.tree, (node) => node.type === "StreamedText"));
  control(appended.tree, "折叠思考内容").props.onPress();
  const folded = h.render("A B C", "streaming");
  assert.ok(control(folded.tree, "展开思考内容"));
  assert.equal(folded.mounts, 1);
  const complete = h.render("A B C", "complete");
  assert.ok(control(complete.tree, "展开思考内容"));
  assert.equal(complete.mounts, 1);
  assert.equal(complete.submit.enabled, false);
});

test("source changes revoke the actual row's click intent, including A to B to A, without remounting", () => {
  const h = timelineHarness();
  const clickTranslate = (text: string, phase?: "streaming" | "complete", identity?: any) => {
    const cur = h.render(text, phase, identity);
    const expand = control(cur.tree, "展开思考内容");
    if (expand) expand.props.onPress();
    control(h.render(text, phase, identity).tree, "翻译此思考块").props.onPress();
  };

  clickTranslate("A");
  assert.equal(h.render("A").submit.enabled, true);
  assert.equal(h.render("B").submit.enabled, false);
  const returned = h.render("A");
  assert.equal(returned.mounts, 1);
  assert.equal(returned.submit.enabled, false);
  clickTranslate("A");
  assert.equal(h.render("A").submit.enabled, true);
  assert.equal(h.render("A", "complete", { host: { id: "other" } }).submit.enabled, false);
  assert.equal(h.render("A", "complete", { agentId: "other" }).submit.enabled, false);
  h.saved.revision = "2";
  assert.equal(h.render("A").submit.enabled, false);
  clickTranslate("A");
  assert.equal(h.render("A").submit.enabled, true);
  h.connection.revision = "rotated-key";
  assert.equal(h.render("A").submit.enabled, false);
});

test("manual cached terminal jobs do not label their action Continue checking", () => {
  const h = timelineHarness();
  const job: rpc.TranslationJob = { jobId: "job", status: "queued", translatedText: null,
    targetLanguage: "简体中文", reason: null, error: null };
  h.cached.set("translation-submit", job);
  control(h.render("A").tree, "展开思考内容").props.onPress();
  assert.equal(control(h.render("A").tree, "翻译此思考块").props.children.props.children, "继续查询");
  for (const status of ["error", "skipped"] as const) {
    h.cached.set("translation-job", { ...job, status });
    const action = control(h.render("A").tree, "翻译此思考块");
    assert.equal(action.props.children.props.children, "翻译");
  }
});

test("ready retranslation is explicit, rapid-click safe and preserves original/fold state without stripping JSON", async () => {
  const submitted: rpc.SubmitTranslationInput[] = [];
  const queued: rpc.TranslationJob = { jobId: "fresh-job", status: "queued", translatedText: null,
    targetLanguage: "简体中文", reason: null, error: null };
  const h = timelineHarness({ rpc: async (_, input) => { submitted.push(input); return queued; } });
  const json = '{"sourceText":"原样保留的 JSON 个案"}';
  h.cached.set("translation-submit", { ...queued, jobId: "old-job", status: "ready", translatedText: json });
  const first = h.render("source");
  control(first.tree, "展开思考内容").props.onPress();
  const opened = h.render("source");
  assert.equal(find(opened.tree, (node) => node.type === "Markdown").props.children, json);
  assert.ok(control(opened.tree, "重新翻译此思考块"));
  control(opened.tree, "显示原文").props.onPress();
  const original = h.render("source");
  const button = control(original.tree, "重新翻译此思考块");
  button.props.onPress();
  button.props.onPress();
  const clicked = h.render("source");
  assert.notDeepEqual(clicked.submit.queryKey, first.submit.queryKey);
  await Promise.all([clicked.submit.queryFn(), clicked.submit.queryFn()]);
  assert.equal(submitted.length, 1);
  assert.ok(submitted[0].retranslateId);
  h.cached.set("translation-submit", queued);
  const pending = h.render("source");
  assert.equal(control(pending.tree, "重新翻译此思考块"), undefined);
  control(pending.tree, "折叠思考内容").props.onPress();
  h.cached.set("translation-job", { ...queued, status: "ready", translatedText: "新的译文" });
  const folded = h.render("source");
  assert.ok(control(folded.tree, "展开思考内容"));
  assert.equal(folded.mounts, 1);
  control(folded.tree, "展开思考内容").props.onPress();
  const expanded = h.render("source");
  assert.equal(find(expanded.tree, (node) => node.type === "Markdown"), undefined);
  control(expanded.tree, "显示译文").props.onPress();
  assert.equal(find(h.render("source").tree, (node) => node.type === "Markdown").props.children, "新的译文");
  h.saved.values.enabled = false;
  const disabled = h.render("source");
  assert.equal(control(disabled.tree, "重新翻译此思考块").props.disabled, true);
  control(disabled.tree, "重新翻译此思考块").props.onPress();
  assert.equal(submitted.length, 1);
});

test("queue-full retranslation retry remains an explicit fresh request, not a ready-cache lookup", async () => {
  const inputs: rpc.SubmitTranslationInput[] = [];
  const h = timelineHarness({ rpc: async (_, input) => {
    inputs.push(input);
    return { jobId: null, status: "skipped", translatedText: null, targetLanguage: "简体中文", reason: "queue_full", error: null };
  } });
  h.cached.set("translation-submit", { jobId: "old", status: "ready", translatedText: "old text",
    targetLanguage: "简体中文", reason: null, error: null });
  const row = h.render("source");
  control(row.tree, "展开思考内容").props.onPress();
  control(h.render("source").tree, "重新翻译此思考块").props.onPress();
  h.cached.set("translation-submit", await h.render("source").submit.queryFn());
  control(h.render("source").tree, "重试翻译").props.onPress();
  await h.render("source").submit.queryFn();
  assert.equal(inputs.length, 2);
  assert.ok(inputs[0].retranslateId);
  assert.ok(inputs[1].retranslateId);
  assert.notEqual(inputs[1].retranslateId, inputs[0].retranslateId);
});

test("actual timeline click to HTTP adapter/service/polling to ready Markdown and original toggle", async (t) => {
  let requests = 0;
  const runner = createHttpTranslator({ fetch: async () => {
    requests++;
    return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [
      { thought: true, text: "private thought" }, { text: requests === 1 ? "**HTTP 译文**" : "**重翻译文**" },
    ] } }] })) as unknown as HttpResponse;
  } });
  const connections = new MemoryConnection();
  const service = new TranslationService(new MemorySettings(), connections, { runner });
  t.after(() => service.close());
  const h = timelineHarness({ rpc: async (contract, input) => contract.name === rpc.submitTranslation.name
    ? service.submit(input) : service.get(input.jobId) });
  h.connection.revision = connections.value.revision;
  const original = h.render("source");
  assert.equal(original.submit.enabled, false);
  assert.equal(requests, 0);
  control(original.tree, "展开思考内容").props.onPress();
  control(h.render("source").tree, "翻译此思考块").props.onPress();
  const clicked = h.render("source");
  h.cached.set("translation-submit", await clicked.submit.queryFn());
  const pending = h.render("source");
  await until(async () => {
    const result = await pending.poll.queryFn();
    h.cached.set("translation-job", result);
    return result.status === "ready";
  });
  const completed = h.render("source");
  const expandBtn = control(completed.tree, "展开思考内容");
  if (expandBtn) expandBtn.props.onPress();
  const opened = h.render("source");
  assert.equal(find(opened.tree, (node) => node.type === "Markdown").props.children, "**HTTP 译文**");
  control(opened.tree, "显示原文").props.onPress();
  assert.equal(find(h.render("source").tree, (node) => node.type === "Markdown"), undefined);
  control(h.render("source").tree, "重新翻译此思考块").props.onPress();
  const retranslation = h.render("source");
  h.cached.delete("translation-job");
  h.cached.set("translation-submit", await retranslation.submit.queryFn());
  const retranslationPoll = h.render("source");
  await until(async () => {
    const result = await retranslationPoll.poll.queryFn();
    h.cached.set("translation-job", result);
    return result.status === "ready";
  });
  assert.equal(requests, 2);
  control(h.render("source").tree, "显示译文").props.onPress();
  assert.equal(find(h.render("source").tree, (node) => node.type === "Markdown").props.children, "**重翻译文**");
  connections.change({ model: "new-model" });
  h.connection.revision = connections.value.revision;
  h.cached.clear();
  const changed = h.render("source");
  assert.equal(changed.submit.enabled, false);
  assert.equal(find(changed.tree, (node) => node.type === "Markdown"), undefined);
  assert.equal(requests, 2);
});

test("streaming auto-collapse: streams expanded, collapses on complete without placeholder text, and toggles via entire header", () => {
  const h = timelineHarness();
  // 1. Streaming phase: default expanded
  const streaming = h.render("Thinking through the problem...", "streaming");
  assert.ok(find(streaming.tree, (node) => node.type === "StreamedText"));
  assert.equal(control(streaming.tree, "折叠思考内容")?.type, "Pressable");

  // 2. Complete phase: automatically collapses to single-line tool item
  const complete = h.render("Thinking through the problem...", "complete");
  assert.equal(find(complete.tree, (node) => node.type === "StreamedText"), undefined);
  assert.equal(
    find(
      complete.tree,
      (node) =>
        node.type === "Text" &&
        typeof node.props?.children === "string" &&
        node.props.children.includes("思考内容已折叠"),
    ),
    undefined,
  );
  const expandHeader = control(complete.tree, "展开思考内容");
  assert.ok(expandHeader);

  // 3. User clicks header to expand details
  expandHeader.props.onPress();
  const expanded = h.render("Thinking through the problem...", "complete");
  assert.ok(control(expanded.tree, "折叠思考内容"));
  assert.ok(
    find(
      expanded.tree,
      (node) => node.type === "Text" && node.props?.children === "Thinking through the problem...",
    ),
  );

  // 4. User clicks header again to collapse back
  control(expanded.tree, "折叠思考内容").props.onPress();
  const reCollapsed = h.render("Thinking through the problem...", "complete");
  assert.ok(control(reCollapsed.tree, "展开思考内容"));
});

test("inline silent diagnostics: errors and over-limit stay quiet on header and render details only inside expanded viewport", () => {
  const h = timelineHarness();
  const overlimitText = "A".repeat(rpc.MAX_SOURCE_CHARS + 10);

  // 1. Overlimit row collapsed by default: header shows concise tag, no bulky error boxes in tree
  const collapsed = h.render(overlimitText, "complete");
  const header = control(collapsed.tree, "展开思考内容");
  assert.ok(header);
  assert.ok(find(header, (node) => node.type === "Text" && node.props?.children === "超限"));
  // No diagnostic text in collapsed view
  assert.equal(
    find(
      collapsed.tree,
      (node) =>
        node.type === "Text" &&
        typeof node.props?.children === "string" &&
        node.props.children.includes("思考文本超出上限"),
    ),
    undefined,
  );

  // 2. Expand header: error explanation is strictly confined inside detail view
  header.props.onPress();
  const expanded = h.render(overlimitText, "complete");
  const diagnostic = find(
    expanded.tree,
    (node) => {
      if (node.type !== "Text") return false;
      const text = Array.isArray(node.props?.children)
        ? node.props.children.join("")
        : String(node.props?.children ?? "");
      return text.includes("思考文本超出上限");
    },
  );
  assert.ok(diagnostic);
});

test("single-viewport toggle: switches between markdown translation and raw source in-place without card bloat", () => {
  const h = timelineHarness();
  const readyJob: rpc.TranslationJob = {
    jobId: "ready-job",
    status: "ready",
    translatedText: "### 翻译后的思考流程\n\n步骤清晰。",
    targetLanguage: "简体中文",
    reason: null,
    error: null,
  };
  h.cached.set("translation-submit", readyJob);

  // Initial complete render: click to expand
  const row = h.render("Original thought", "complete");
  control(row.tree, "展开思考内容").props.onPress();
  const opened = h.render("Original thought", "complete");

  // Default shows markdown translated text
  const markdown = find(opened.tree, (node) => node.type === "Markdown");
  assert.equal(markdown.props.children, "### 翻译后的思考流程\n\n步骤清晰。");

  // Click pill to show original in-place
  const togglePill = control(opened.tree, "显示原文");
  assert.ok(togglePill);
  togglePill.props.onPress();
  const showingOriginal = h.render("Original thought", "complete");

  // Now markdown is gone, raw text is shown
  assert.equal(find(showingOriginal.tree, (node) => node.type === "Markdown"), undefined);
  assert.ok(
    find(
      showingOriginal.tree,
      (node) => node.type === "Text" && node.props?.children === "Original thought",
    ),
  );

  // Click pill again to toggle back to translated markdown
  control(showingOriginal.tree, "显示译文").props.onPress();
  const backToTranslated = h.render("Original thought", "complete");
  assert.equal(
    find(backToTranslated.tree, (node) => node.type === "Markdown").props.children,
    "### 翻译后的思考流程\n\n步骤清晰。",
  );
});

test("native visual blend: native brain icon in folded row, smooth chevron in card header, and no dangling buttons", () => {
  const h = timelineHarness();
  const rendered = h.render("A detailed thought block", "complete");

  // 1. Folded state: native Brain icon in iconBadge, matching native tool icons (Eye/SquareTerminal/Brain)
  const icons = findAll(rendered.tree, (node) => node.type === "Icon");
  assert.equal(icons.length, 1);
  assert.equal(icons[0].props.name, "Brain");

  // 2. Folded row right side is 100% clean (no dangling "翻译" or "重试" button)
  assert.equal(control(rendered.tree, "翻译此思考块"), undefined);
  assert.equal(control(rendered.tree, "重试翻译"), undefined);

  // 3. Expand to inspect viewport
  control(rendered.tree, "展开思考内容").props.onPress();
  const expanded = h.render("A detailed thought block", "complete");

  // In expanded state, chevron flips to ChevronDown
  const expandedIcons = findAll(expanded.tree, (node) => node.type === "Icon");
  assert.equal(expandedIcons.length, 1);
  assert.equal(expandedIcons[0].props.name, "ChevronDown");

  // 4. Viewport has no character count noise ("XXX 字符")
  assert.equal(
    find(
      expanded.tree,
      (node) =>
        node.type === "Text" &&
        typeof node.props?.children === "string" &&
        node.props.children.includes("字符"),
    ),
    undefined,
  );

  // 5. Expanded view is a unified card container enclosing cardHeader and cardBody together
  assert.equal(expanded.tree.type, "View");
  assert.equal(expanded.tree.props.style?.borderRadius, 8);
  assert.equal(expanded.tree.props.style?.borderWidth, 1);
  const header = control(expanded.tree, "折叠思考内容");
  assert.ok(header);
  const titleText = find(header, (n) => n.props?.children === "思考过程");
  assert.equal(titleText.props.style?.fontWeight, "500");
});
