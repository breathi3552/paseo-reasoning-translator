import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { deferred } from "./test-helpers";
import { createHttpTranslator, type HttpResponse } from "./http-translator";
import { DEFAULT_CONNECTION } from "../shared/connection";

const reply = (value: unknown, status = 200): HttpResponse =>
  new Response(JSON.stringify(value), { status }) as unknown as HttpResponse;

test("formats Gemini and OpenAI-compatible requests and extracts only final visible translation text", async () => {
  for (const format of ["gemini", "openai"] as const) {
    const connection = {
      ...DEFAULT_CONNECTION,
      format,
      apiKey: "offline-test-key",
      revision: "r1",
      baseUrl: format === "gemini" ? DEFAULT_CONNECTION.baseUrl : "https://compat.example/custom/v1",
      model: format === "gemini" ? "gemini-3.5-flash-lite" : "user-supplied-model",
    };
    const runner = createHttpTranslator({
      fetch: async (url, init) => {
        const body = JSON.parse(init.body);
        if (format === "gemini") {
          assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
          assert.equal(init.headers["x-goog-api-key"], "offline-test-key");
          assert.equal(body.contents[0].parts[0].text, "<source_text>\nquoted source\n</source_text>");
          assert.match(body.systemInstruction.parts[0].text, /简体中文/);
          return reply({
            candidates: [{
              finishReason: "STOP",
              content: { role: "model", parts: [{ thought: true, text: "private thought" }, { text: "译文" }] },
            }],
          });
        }
        assert.equal(url, "https://compat.example/custom/v1/chat/completions");
        assert.equal(init.headers.Authorization, "Bearer offline-test-key");
        assert.equal(body.messages[1].content, "<source_text>\nquoted source\n</source_text>");
        assert.match(body.messages[0].content, /简体中文/);
        return reply({
          choices: [{
            finish_reason: "stop",
            message: { role: "assistant", content: "译文", reasoning_content: "private thought" },
          }],
        });
      },
    });
    const output = await runner.translate({
      connection,
      text: "quoted source",
      language: "简体中文",
      signal: new AbortController().signal,
    });
    assert.equal(output, "译文");
    await runner.close();
  }
});

test("rejects incomplete model outputs, HTTP error statuses, and malformed responses without leaking payloads", async () => {
  const cases: Array<{ format: "gemini" | "openai"; response: () => Promise<HttpResponse> }> = [
    {
      format: "openai",
      response: async () => reply({ choices: [{ finish_reason: "length", message: { role: "assistant", content: "partial" } }] }),
    },
    {
      format: "openai",
      response: async () => reply({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: null, refusal: "private refusal" } }] }),
    },
    {
      format: "gemini",
      response: async () => reply({ candidates: [{ finishReason: "MAX_TOKENS", content: { role: "model", parts: [{ text: "partial" }] } }] }),
    },
    {
      format: "gemini",
      response: async () => reply({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: "private thought", thought: true }] } }] }),
    },
    {
      format: "gemini",
      response: async () => new Response("private error body", { status: 401 }) as unknown as HttpResponse,
    },
    {
      format: "gemini",
      response: async () => new Response("not-json", { status: 200 }) as unknown as HttpResponse,
    },
  ];

  for (const { format, response } of cases) {
    const runner = createHttpTranslator({ fetch: () => response() });
    await assert.rejects(
      runner.translate({
        connection: { ...DEFAULT_CONNECTION, format, apiKey: "offline-secret", revision: "r" },
        text: "private source",
        language: "en",
        signal: new AbortController().signal,
      }),
      (error: Error) => !/private|offline-secret|partial/.test(error.message),
    );
    await runner.close();
  }
});

test("aborts in-flight requests on timeout, caller cancellation, or close", async () => {
  for (const stop of ["timeout", "cancel", "close"] as const) {
    const started = deferred<void>();
    let signal!: AbortSignal;
    const runner = createHttpTranslator({
      timeoutMs: stop === "timeout" ? 15 : 5000,
      fetch: async (_, init) => {
        signal = init.signal;
        started.resolve();
        return new Promise(() => {});
      },
    });
    const parent = new AbortController();
    const rejected = assert.rejects(
      runner.translate({
        connection: { ...DEFAULT_CONNECTION, apiKey: "offline-key", revision: "r" },
        text: "source",
        language: "en",
        signal: parent.signal,
      }),
      /超时|取消/,
    );
    await started.promise;
    if (stop === "cancel") parent.abort();
    if (stop === "close") await runner.close();
    assert.equal(await Promise.race([rejected.then(() => true), delay(200).then(() => false)]), true);
    assert.equal(signal.aborted, true);
    await runner.close();
  }
});
