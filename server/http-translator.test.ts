import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { deferred } from "./test-helpers";
import { createHttpTranslator, type HttpResponse } from "./http-translator";
import { DEFAULT_CONNECTION } from "../shared/connection";

const reply = (value: unknown): HttpResponse => new Response(JSON.stringify(value)) as unknown as HttpResponse;
for (const format of ["gemini", "openai"] as const) {
  test(`${format} sends only documented HTTP translation fields and extracts final visible text`, async () => {
    let calls = 0;
    const connection = { ...DEFAULT_CONNECTION, format, apiKey: "offline-test-key", revision: "r1",
      baseUrl: format === "gemini" ? DEFAULT_CONNECTION.baseUrl : "https://compat.example/custom/v1",
      model: format === "gemini" ? "gemini-3.5-flash-lite" : "user-supplied-model" };
    const runner = createHttpTranslator({ fetch: async (url, init) => {
      calls++;
      assert.equal(init.redirect, "error");
      assert.equal(init.method, "POST");
      assert.equal(url.includes("offline-test-key"), false);
      const body = JSON.parse(init.body);
      if (format === "gemini") {
        assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
        assert.equal(init.headers["x-goog-api-key"], "offline-test-key");
        assert.deepEqual(Object.keys(body).sort(), ["contents", "systemInstruction"]);
        assert.equal(JSON.parse(body.contents[0].parts[0].text).sourceText, "quoted source");
        return reply({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [
          { thought: true, text: "private thought" }, { text: "译文" },
        ] } }] });
      }
      assert.equal(url, "https://compat.example/custom/v1/chat/completions");
      assert.equal(init.headers.Authorization, "Bearer offline-test-key");
      assert.deepEqual(Object.keys(body).sort(), ["messages", "model", "stream"]);
      assert.equal(body.stream, false);
      assert.equal(body.messages[0].role, "system");
      assert.equal(JSON.parse(body.messages[1].content).sourceText, "quoted source");
      return reply({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "译文", reasoning_content: "private thought" } }] });
    } });
    assert.equal(await runner.translate({ connection, text: "quoted source", language: "简体中文", signal: new AbortController().signal }), "译文");
    assert.equal(calls, 1);
    await runner.close();
  });
}

test("malformed Gemini thought markers cannot expose reasoning as translation", async () => {
  const runner = createHttpTranslator({ fetch: async () => reply({ candidates: [{ finishReason: "STOP", content: {
    role: "model", parts: [{ text: "private reasoning", thought: "true" }],
  } }] }) });
  await assert.rejects(runner.translate({ connection: { ...DEFAULT_CONNECTION, apiKey: "offline-key", revision: "r" }, text: "source", language: "en", signal: new AbortController().signal }));
  await runner.close();
});

const rejectedResponses: Array<{ format: "gemini" | "openai"; label: string; value: unknown }> = [
  { format: "openai", label: "truncation", value: { choices: [{ finish_reason: "length", message: { role: "assistant", content: "partial" } }] } },
  { format: "openai", label: "refusal", value: { choices: [{ finish_reason: "stop", message: { role: "assistant", content: null, refusal: "private refusal" } }] } },
  { format: "openai", label: "tool call", value: { choices: [{ finish_reason: "tool_calls", message: { role: "assistant", tool_calls: [{ function: { name: "tool" } }] } }] } },
  { format: "openai", label: "reasoning only", value: { choices: [{ finish_reason: "stop", message: { role: "assistant", content: null, reasoning_content: "private reasoning" } }] } },
  { format: "openai", label: "empty text", value: { choices: [{ finish_reason: "stop", message: { role: "assistant", content: " " } }] } },
  { format: "gemini", label: "truncation", value: { candidates: [{ finishReason: "MAX_TOKENS", content: { role: "model", parts: [{ text: "partial" }] } }] } },
  { format: "gemini", label: "blocked", value: { promptFeedback: { blockReason: "SAFETY" } } },
  { format: "gemini", label: "thought only", value: { candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: "private reasoning", thought: true }] } }] } },
  { format: "gemini", label: "tool call", value: { candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ functionCall: { name: "tool" } }] } }] } },
];
for (const { format, label, value } of rejectedResponses) {
  test(`${format} rejects ${label} without leaking the response or automatically retrying`, async () => {
    let calls = 0;
    const runner = createHttpTranslator({ fetch: async () => { calls++; return reply(value); } });
    await assert.rejects(runner.translate({ connection: { ...DEFAULT_CONNECTION, format, apiKey: "offline-secret", revision: "r" }, text: "private source", language: "en", signal: new AbortController().signal }),
      (error: Error) => !/private|offline-secret|partial/.test(error.message));
    assert.equal(calls, 1);
    await runner.close();
  });
}

test("HTTP status, network and non-JSON errors are actionable, sanitized and never retried", async () => {
  for (const kind of [401, 403, 404, 429, 500, "network", "json"] as const) {
    let calls = 0;
    const runner = createHttpTranslator({ fetch: async () => {
      calls++;
      if (kind === "network") throw new Error("private source and offline-secret");
      return new Response("private source and offline-secret", { status: kind === "json" ? 200 : kind }) as unknown as HttpResponse;
    } });
    await assert.rejects(runner.translate({ connection: { ...DEFAULT_CONNECTION, apiKey: "offline-secret", revision: "r" }, text: "source", language: "en", signal: new AbortController().signal }), (error: Error) => {
      assert.equal(/private|offline-secret/.test(error.message), false);
      return kind === "network" || kind === "json" || error.message.includes(String(kind)) || error.message.includes("5xx");
    });
    assert.equal(calls, 1);
    await runner.close();
  }
});

for (const stage of ["fetch", "body"] as const) {
  test(`non-cooperative ${stage} is bounded by timeout, cancellation and close`, async () => {
    for (const stop of ["timeout", "cancel", "close"] as const) {
      const started = deferred<void>();
      let signal!: AbortSignal;
      const runner = createHttpTranslator({ timeoutMs: stop === "timeout" ? 15 : 5000, fetch: async (_, init) => {
        signal = init.signal;
        started.resolve();
        if (stage === "fetch") return new Promise(() => {});
        return { ok: true, status: 200, body: { getReader: () => ({ read: () => new Promise(() => {}), cancel: () => new Promise(() => {}) }) } };
      } });
      const parent = new AbortController();
      const rejected = assert.rejects(runner.translate({ connection: { ...DEFAULT_CONNECTION, apiKey: "offline-key", revision: "r" }, text: "source", language: "en", signal: parent.signal }), /超时|取消/);
      await started.promise;
      if (stop === "cancel") parent.abort();
      if (stop === "close") await runner.close();
      assert.equal(await Promise.race([rejected.then(() => true), delay(200).then(() => false)]), true);
      assert.equal(signal.aborted, true);
      assert.equal(await Promise.race([runner.close().then(() => true), delay(100).then(() => false)]), true);
    }
  });
}

test("oversized HTTP response is cancelled before it can become a ready translation", async () => {
  const runner = createHttpTranslator({ maxResponseBytes: 32, fetch: async () => reply({ text: "x".repeat(1000) }) });
  await assert.rejects(runner.translate({ connection: { ...DEFAULT_CONNECTION, apiKey: "offline-key", revision: "r" }, text: "source", language: "en", signal: new AbortController().signal }), /大小上限/);
  await runner.close();
});

test("actual Node fetch sends the exact SenseNova-compatible path and Bearer key to a loopback-only server", async (t) => {
  let calls = 0;
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    assert.equal(request.url, "/compatible-mode/v2/chat/completions");
    assert.equal(request.headers.authorization, "Bearer offline-loopback-key");
    const body = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(body.model, "user-supplied-model");
    assert.deepEqual(Object.keys(body).sort(), ["messages", "model", "stream"]);
    calls++;
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "loopback translation" } }] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));
  const runner = createHttpTranslator();
  t.after(() => runner.close());
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/compatible-mode/v2`;
  const output = await runner.translate({ connection: { format: "openai", baseUrl, model: "user-supplied-model", apiKey: "offline-loopback-key", revision: "r" },
    text: "quoted source", language: "en", signal: new AbortController().signal });
  assert.equal(output, "loopback translation");
  assert.equal(calls, 1);
});

test("Node fetch refuses redirects rather than forwarding credentials to a redirect target", async (t) => {
  let calls = 0;
  const server = createServer((request, response) => {
    calls++;
    response.writeHead(request.url === "/target" ? 200 : 302, { Location: "/target" });
    response.end("private redirect response");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));
  const runner = createHttpTranslator();
  t.after(() => runner.close());
  await assert.rejects(runner.translate({ connection: { format: "openai", model: "user-model", apiKey: "offline-key", revision: "r",
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }, text: "source", language: "en", signal: new AbortController().signal }),
    (error: Error) => !/offline-key|private redirect/.test(error.message));
  assert.equal(calls, 1);
});
