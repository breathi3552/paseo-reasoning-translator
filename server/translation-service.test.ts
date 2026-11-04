import assert from "node:assert/strict";
import test from "node:test";
import { MAX_SOURCE_CHARS, type TranslationJob } from "../shared/rpc";
import { TranslationService } from "./translation-service";
import { MemorySettings, MemoryConnection, recordingRunner, deferred, until } from "./test-helpers";
import { createHttpTranslator, type HttpResponse } from "./http-translator";
import type { PrivateConnection } from "./connection";
import { setTimeout as delay } from "node:timers/promises";

function fixture(options: ConstructorParameters<typeof TranslationService>[2] = {}) {
  const settings = new MemorySettings();
  const connection = new MemoryConnection();
  const recording = recordingRunner();
  const service = new TranslationService(settings, connection, { runner: recording.runner, ...options });
  const input = (text = "source", retry = false) => ({ agentId: "agent", text, retry,
    settingsRevision: settings.revision, connectionRevision: connection.value.revision });
  return { service, settings, connection, input, ...recording };
}
async function terminal(service: TranslationService, job: TranslationJob) {
  assert.ok(job.jobId);
  let result!: TranslationJob;
  await until(async () => {
    result = await service.get(job.jobId!);
    return !["queued", "running"].includes(result.status);
  });
  return result;
}
test("HTTP adapter to service returns ready without any Paseo API or key in public results/cache identity", async (t) => {
  let calls = 0;
  const runner = createHttpTranslator({ fetch: async () => {
    calls++;
    return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: "译文" }] } }] })) as unknown as HttpResponse;
  } });
  const f = fixture({ runner });
  t.after(() => f.service.close());
  const result = await terminal(f.service, await f.service.submit(f.input()));
  assert.equal(result.status, "ready");
  assert.equal(result.translatedText, "译文");
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(result).includes("offline-secret"), false);
});

test("disabled, incomplete connection, limits and stale click revisions never call HTTP", async (t) => {
  const f = fixture();
  t.after(() => f.service.close());
  await f.settings.change({ enabled: false });
  assert.equal((await f.service.submit(f.input())).reason, "disabled");
  await f.settings.change({ enabled: true });
  const oldClick = f.input();
  f.connection.change({ apiKey: null });
  assert.equal((await f.service.submit(f.input())).reason, "connection_required");
  f.connection.change({ apiKey: "different-key" });
  assert.equal((await f.service.submit(oldClick)).reason, "connection_changed");
  assert.equal((await f.service.submit(f.input(" "))).reason, "empty_text");
  assert.equal((await f.service.submit(f.input("x".repeat(MAX_SOURCE_CHARS + 1)))).status, "error");
  assert.equal(f.requests.length, 0);
});

test("deduplicates admissions, chunks every source character serially and retries only explicitly", async (t) => {
  const f = fixture({ chunkChars: 4 });
  t.after(() => f.service.close());
  const jobs = await Promise.all(Array.from({ length: 8 }, () => f.service.submit(f.input("abcdefgh"))));
  assert.equal(new Set(jobs.map((job) => job.jobId)).size, 1);
  assert.equal((await terminal(f.service, jobs[0])).translatedText, "译:abcd\n\n译:efgh");
  assert.deepEqual(f.requests.map((request) => request.text), ["abcd", "efgh"]);
  assert.equal((await f.service.submit(f.input("abcdefgh"))).jobId, jobs[0].jobId);
});

test("connection/key and settings changes revoke queued/ready work and abort the active HTTP request", async (t) => {
  for (const change of ["connection", "settings"] as const) {
    let signal!: AbortSignal;
    const runner = createHttpTranslator({ fetch: async (_, init) => { signal = init.signal; return new Promise(() => {}); }, timeoutMs: 5000 });
    const f = fixture({ runner });
    t.after(() => f.service.close());
    const first = await f.service.submit(f.input());
    await until(() => Boolean(signal));
    const queued = await f.service.submit(f.input("queued"));
    if (change === "connection") f.connection.change({ apiKey: "rotated-secret" });
    else await f.settings.change({ targetLanguage: "日本語" });
    assert.equal(signal.aborted, true);
    assert.equal((await terminal(f.service, first)).translatedText, null);
    assert.equal((await terminal(f.service, queued)).translatedText, null);
    await f.service.close();
  }
});

for (const stage of ["fetch", "body"] as const) {
  test(`HTTP ${stage} deadlines release the serial queue even when the adapter never cooperates`, async (t) => {
  let calls = 0;
  const runner = createHttpTranslator({ timeoutMs: 15, fetch: async () => {
    if (++calls === 1) {
      if (stage === "fetch") return new Promise(() => {});
      return { ok: true, status: 200, body: { getReader: () => ({ read: () => new Promise(() => {}), cancel: async () => {} }) } };
    }
    return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: "later" }] } }] })) as unknown as HttpResponse;
  } });
  const f = fixture({ runner });
  t.after(() => f.service.close());
  const one = await f.service.submit(f.input("first"));
  const two = await f.service.submit(f.input("second"));
  assert.equal((await terminal(f.service, two)).status, "ready");
  assert.equal((await f.service.get(one.jobId!)).status, "error");
  assert.equal(calls, 2);
  });
}

test("sticky failures, bounded queue/cache/TTL, clear and explicit retry retain their contracts", async (t) => {
  let fail = true;
  let now = 0;
  const pending = deferred<string>();
  const recording = recordingRunner(async () => { if (fail) throw new Error("private provider body and key"); return pending.promise; });
  const f = fixture({ runner: recording.runner, now: () => now, maxQueue: 1, maxCache: 1, ttlMs: 10 });
  t.after(() => f.service.close());
  const first = await f.service.submit(f.input());
  const failed = await terminal(f.service, first);
  assert.equal(failed.status, "error");
  assert.equal(failed.error?.includes("private"), false);
  assert.equal((await f.service.submit(f.input())).jobId, first.jobId);
  fail = false;
  const retry = await f.service.submit(f.input("source", true));
  assert.notEqual(retry.jobId, first.jobId);
  await until(() => recording.requests.length === 2);
  await f.service.submit(f.input("waiting"));
  assert.equal((await f.service.submit(f.input("overflow"))).reason, "queue_full");
  pending.resolve("译文");
  await terminal(f.service, retry);
  now = 20;
  assert.equal((await f.service.get(retry.jobId!)).reason, "job_expired");
  f.service.clear();
  assert.equal((await f.service.get(first.jobId!)).reason, "job_expired");
});

test("connection changes during asynchronous admission revoke the old click before any HTTP send", async (t) => {
  const f = fixture();
  t.after(() => f.service.close());
  const gate = deferred<PrivateConnection>();
  const previous = await f.connection.read();
  let entered = false;
  f.connection.read = async () => { entered = true; return gate.promise; };
  const pending = f.service.submit(f.input());
  await until(() => entered);
  f.connection.change({ model: "new-model" });
  gate.resolve(previous);
  assert.equal((await pending).reason, "connection_changed");
  assert.equal(f.requests.length, 0);
});

test("unnotified connection drift is re-read before publish; ready caches never cross configuration revisions", async (t) => {
  const output = deferred<string>();
  const recording = recordingRunner(() => output.promise);
  const f = fixture({ runner: recording.runner });
  t.after(() => f.service.close());
  const oldClick = f.input();
  const first = await f.service.submit(oldClick);
  await until(() => recording.requests.length === 1);
  f.connection.change({ apiKey: "new-offline-key" }, false);
  output.resolve("stale output");
  const skipped = await terminal(f.service, first);
  assert.equal(skipped.reason, "connection_changed");
  assert.equal(skipped.translatedText, null);
  assert.equal((await f.service.submit({ ...oldClick, retry: true })).reason, "connection_changed");
  assert.equal(recording.requests.length, 1);
  const fresh = await terminal(f.service, await f.service.submit(f.input()));
  assert.equal(fresh.status, "ready");
  f.connection.change({ model: "new-model" });
  assert.equal((await f.service.get(fresh.jobId!)).translatedText, null);
});

test("explicit ready retranslation bypasses only that source cache and deduplicates the same action even after completion", async (t) => {
  const second = deferred<string>();
  let calls = 0;
  const recording = recordingRunner(async () => ++calls === 2 ? second.promise : `translation-${calls}`);
  const f = fixture({ runner: recording.runner });
  t.after(async () => { second.resolve("cleanup"); await f.service.close(); });
  const first = await terminal(f.service, await f.service.submit(f.input()));
  const retransmit = { ...f.input(), retranslateId: "explicit-click-1" };
  const repeated = await Promise.all(Array.from({ length: 8 }, () => f.service.submit(retransmit)));
  assert.notEqual(repeated[0].jobId, first.jobId);
  assert.equal(new Set(repeated.map((job) => job.jobId)).size, 1);
  await until(() => recording.requests.length === 2);
  assert.equal((await f.service.submit({ ...f.input(), retranslateId: "another-rapid-click" })).jobId, repeated[0].jobId);
  second.resolve("fresh translation");
  assert.equal((await terminal(f.service, repeated[0])).translatedText, "fresh translation");
  assert.equal((await f.service.submit(retransmit)).jobId, repeated[0].jobId);
  assert.equal(recording.requests.length, 2);
  const next = await terminal(f.service, await f.service.submit({ ...f.input(), retranslateId: "explicit-click-2" }));
  assert.notEqual(next.jobId, repeated[0].jobId);
  assert.equal(recording.requests.length, 3);
  const other = await terminal(f.service, await f.service.submit(f.input("other source")));
  await terminal(f.service, await f.service.submit({ ...f.input(), retranslateId: "explicit-click-3" }));
  assert.equal((await f.service.submit(f.input("other source"))).jobId, other.jobId);
});

test("queue-full retranslation does not evict the existing ready result", async (t) => {
  const pending = deferred<string>();
  const recording = recordingRunner(async (request) => request.text === "cached" ? "ready" : pending.promise);
  const f = fixture({ runner: recording.runner, maxQueue: 1 });
  t.after(async () => { pending.resolve("done"); await f.service.close(); });
  const cached = await terminal(f.service, await f.service.submit(f.input("cached")));
  await f.service.submit(f.input("active"));
  await until(() => recording.requests.length === 2);
  await f.service.submit(f.input("queued"));
  const rejected = await f.service.submit({ ...f.input("cached"), retranslateId: "explicit-click" });
  assert.equal(rejected.reason, "queue_full");
  assert.equal((await f.service.submit(f.input("cached"))).jobId, cached.jobId);
  assert.equal(recording.requests.length, 2);
});

test("service close aborts hanging HTTP without waiting for its configured deadline", async () => {
  let signal!: AbortSignal;
  const runner = createHttpTranslator({ timeoutMs: 5000, fetch: async (_, init) => { signal = init.signal; return new Promise(() => {}); } });
  const f = fixture({ runner });
  await f.service.submit(f.input());
  await until(() => Boolean(signal));
  assert.equal(await Promise.race([f.service.close().then(() => true), delay(200).then(() => false)]), true);
  assert.equal(signal.aborted, true);
  assert.equal(f.connection.listenerCount, 0);
  assert.equal(f.settings.listenerCount, 0);
});
