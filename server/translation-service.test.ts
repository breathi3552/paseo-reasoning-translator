import assert from "node:assert/strict";
import test from "node:test";
import { MAX_SOURCE_CHARS, type TranslationJob } from "../shared/rpc";
import { TranslationService } from "./translation-service";
import { MemorySettings, MemoryConnection, recordingRunner, deferred, until } from "./test-helpers";
import { createHttpTranslator } from "./http-translator";

function fixture(options: ConstructorParameters<typeof TranslationService>[2] = {}) {
  const settings = new MemorySettings();
  const connection = new MemoryConnection();
  const recording = recordingRunner();
  const service = new TranslationService(settings, connection, { runner: recording.runner, ...options });
  const input = (text = "source", retry = false) => ({
    agentId: "agent",
    text,
    retry,
    settingsRevision: settings.revision,
    connectionRevision: connection.value.revision,
  });
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

test("disabled state, incomplete connection, invalid text bounds, and stale revisions skip HTTP execution", async (t) => {
  const f = fixture();
  t.after(() => f.service.close());

  await f.settings.change({ enabled: false });
  assert.equal((await f.service.submit(f.input())).reason, "disabled");

  await f.settings.change({ enabled: true });
  const staleInput = f.input();
  f.connection.change({ apiKey: null });
  assert.equal((await f.service.submit(f.input())).reason, "connection_required");

  f.connection.change({ apiKey: "different-key" });
  assert.equal((await f.service.submit(staleInput)).reason, "connection_changed");
  assert.equal((await f.service.submit(f.input(" "))).reason, "empty_text");
  assert.equal((await f.service.submit(f.input("x".repeat(MAX_SOURCE_CHARS + 1)))).status, "error");
  assert.equal(f.requests.length, 0);
});

test("deduplicates concurrent submissions and translates multi-chunk text preserving surrogate pairs", async (t) => {
  const f = fixture({ chunkChars: 5 });
  t.after(() => f.service.close());

  const source = "abc😀def\n\n尾段";
  const jobs = await Promise.all(Array.from({ length: 6 }, () => f.service.submit(f.input(source))));
  assert.equal(new Set(jobs.map((job) => job.jobId)).size, 1);

  const done = await terminal(f.service, jobs[0]);
  assert.equal(done.status, "ready");
  assert.equal(f.requests.map((r) => r.text).join(""), source);
  assert.ok(f.requests.every((r) => r.text.length <= 5));
  assert.equal(done.translatedText, f.requests.map((r) => "译:" + r.text).join("\n\n"));
  assert.equal((await f.service.submit(f.input(source))).jobId, jobs[0].jobId);
});

test("caches sticky errors until explicit retry, supports explicit retranslation, and enforces queue/TTL limits", async (t) => {
  let fail = true;
  let now = 0;
  const pending = deferred<string>();
  const recording = recordingRunner(async (req) => {
    if (fail) throw new Error("provider failure");
    return req.text === "source" ? "译文-" + recording.requests.length : pending.promise;
  });
  const f = fixture({ runner: recording.runner, now: () => now, maxQueue: 1, maxCache: 2, ttlMs: 10 });
  t.after(async () => {
    pending.resolve("done");
    await f.service.close();
  });

  // 1. Sticky failure requires explicit retry=true
  const first = await f.service.submit(f.input());
  const failed = await terminal(f.service, first);
  assert.equal(failed.status, "error");
  assert.equal((await f.service.submit(f.input())).jobId, first.jobId);

  fail = false;
  const retried = await terminal(f.service, await f.service.submit(f.input("source", true)));
  assert.equal(retried.status, "ready");
  assert.equal(retried.translatedText, "译文-2");

  // 2. Explicit retranslateId bypasses ready cache and deduplicates identical click IDs
  const retransmit = { ...f.input("source"), retranslateId: "click-1" };
  const [r1, r2] = await Promise.all([f.service.submit(retransmit), f.service.submit(retransmit)]);
  assert.equal(r1.jobId, r2.jobId);
  assert.notEqual(r1.jobId, retried.jobId);
  assert.equal((await terminal(f.service, r1)).translatedText, "译文-3");

  // 3. Queue limit and TTL expiration
  await f.service.submit(f.input("active"));
  await until(() => recording.requests.length === 4);
  await f.service.submit(f.input("queued"));
  assert.equal((await f.service.submit(f.input("overflow"))).reason, "queue_full");

  now = 20;
  assert.equal((await f.service.get(r1.jobId!)).reason, "job_expired");
});

test("settings or connection changes and service close abort active HTTP work and revoke results", async (t) => {
  for (const change of ["connection", "settings", "close"] as const) {
    let signal!: AbortSignal;
    const runner = createHttpTranslator({
      fetch: async (_, init) => {
        signal = init.signal;
        return new Promise(() => {});
      },
      timeoutMs: 5000,
    });
    const f = fixture({ runner });
    t.after(() => f.service.close());

    const active = await f.service.submit(f.input("active"));
    await until(() => Boolean(signal));
    const queued = await f.service.submit(f.input("queued"));

    if (change === "connection") f.connection.change({ apiKey: "rotated-secret" });
    else if (change === "settings") await f.settings.change({ targetLanguage: "日本語" });
    else await f.service.close();

    assert.equal(signal.aborted, true);
    if (change !== "close") {
      assert.equal((await terminal(f.service, active)).translatedText, null);
      assert.equal((await terminal(f.service, queued)).translatedText, null);
    }
    await f.service.close();
  }
});
