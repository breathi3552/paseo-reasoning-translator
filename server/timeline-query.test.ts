import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { setImmediate as tick } from "node:timers/promises";
import { QueryClient, QueryObserver, focusManager, onlineManager } from "@tanstack/react-query";
import { settingsSchema, translationSettings } from "../shared/settings";
import { DEFAULT_CONNECTION, connectionQueryOptions } from "../shared/connection";
import { MAX_SOURCE_CHARS, type TranslationJob, type SubmitTranslationInput } from "../shared/rpc";
import {
  canTranslate, createTranslationIntent, translationIdentity,
  translationSubmitOptions, translationPollOptions, translationRetryAction,
  type TranslationContext,
} from "../shared/translation-query";

const queued: TranslationJob = {
  jobId: "job-1", status: "queued", targetLanguage: "简体中文",
  translatedText: null, reason: null, error: null,
};
const ready: TranslationJob = { ...queued, status: "ready", translatedText: "译文" };
function context(patch: Partial<TranslationContext> = {}): TranslationContext {
  return {
    hostId: "host-1", agentId: "agent-1", text: "Reasoning A", revision: "1",
    phase: "complete",
    values: settingsSchema.parse({ enabled: true }),
    connection: { ...DEFAULT_CONNECTION, hasApiKey: true, revision: "c1" },
    ...patch,
  };
}
async function settle() { for (let i = 0; i < 5; i++) await tick(); }
const cleanups = new WeakMap<QueryClient, Array<() => void>>();
function clientFor(t: TestContext) {
  const client = new QueryClient();
  cleanups.set(client, []);
  client.mount();
  t.after(() => {
    // Destroy observers before clearing: reversing this order leaves orphan GC timers.
    for (const cleanup of cleanups.get(client)!) cleanup();
    client.unmount();
    client.clear();
  });
  return client;
}
function watch(
  t: TestContext, client: QueryClient,
  options: ReturnType<typeof translationSubmitOptions> | ReturnType<typeof translationPollOptions>,
) {
  const observer = new QueryObserver<TranslationJob>(client, options);
  const unsubscribe = observer.subscribe(() => {});
  cleanups.get(client)!.push(() => { unsubscribe(); observer.destroy(); });
  return observer;
}

test("new host settings default to manual and require explicit opt-in", () => {
  assert.equal(translationSettings.scope, "host");
  const defaults = translationSettings.schema.parse({});
  assert.equal(defaults.translationMode, "manual");
  assert.equal(defaults.enabled, false);
  assert.equal(settingsSchema.safeParse({ translationMode: "unknown" }).success, false);
});

test("manual history, stream completion, rerender, focus and reconnect submit nothing before clicking", async (t) => {
  const client = clientFor(t);
  const calls: string[] = [];
  const submit = async ({ text }: { text: string }) => { calls.push(text); return queued; };
  const a = context({ phase: "streaming" });
  const first = watch(t, client, translationSubmitOptions(a, null, submit));
  const b = context({ text: "History B" });
  watch(t, client, translationSubmitOptions(b, null, submit));
  first.setOptions(translationSubmitOptions(context(), null, submit));
  first.setOptions(translationSubmitOptions(context(), null, submit));
  focusManager.setFocused(false); focusManager.setFocused(true);
  onlineManager.setOnline(false); onlineManager.setOnline(true);
  await client.invalidateQueries();
  await settle();
  assert.deepEqual(calls, []);
  // Even an accidental refetch of a disabled query must not bypass the RPC gate.
  await first.refetch();
  assert.deepEqual(calls, []);
});

test("click submits only the target block once; pending, cache invalidation and refetch reuse the attempt", async (t) => {
  const client = clientFor(t);
  const calls: string[] = [];
  let resolve!: (job: TranslationJob) => void;
  const pending = new Promise<TranslationJob>((yes) => { resolve = yes; });
  const submit = async ({ text }: { text: string }) => { calls.push(text); return pending; };
  const a = context();
  const b = context({ text: "Reasoning B" });
  const first = watch(t, client, translationSubmitOptions(a, null, submit));
  watch(t, client, translationSubmitOptions(b, null, submit));
  const intent = createTranslationIntent(a, 0, submit)!;
  first.setOptions(translationSubmitOptions(a, intent, submit));
  await settle();
  assert.equal(first.getCurrentResult().isFetching, true);
  assert.deepEqual(calls, [a.text]);
  assert.equal(translationRetryAction(a, intent, true, false, false), "none");
  resolve(queued);
  await settle();
  await first.refetch();
  await client.invalidateQueries({ queryKey: ["translation-submit"] });
  await settle();
  assert.deepEqual(calls, [a.text]);
  assert.equal(first.getCurrentResult().data?.jobId, queued.jobId);
});

test("streaming, blank, overlimit, disabled, missing connection and unavailable settings cannot submit or retry", async (t) => {
  const client = clientFor(t);
  let calls = 0;
  const submit = async () => { calls++; return queued; };
  const valid = context();
  const invalid = [
    context({ phase: "streaming" }), context({ text: " \n " }),
    context({ text: "a".repeat(MAX_SOURCE_CHARS + 1) }),
    context({ values: { ...valid.values!, enabled: false } }),
    context({ connection: null }),
    context({ connection: { ...valid.connection!, hasApiKey: false } }),
    context({ values: null, revision: null }),
  ];
  for (const value of invalid) {
    assert.equal(canTranslate(value), false);
    assert.equal(createTranslationIntent(value, 0, submit), null);
    assert.equal(translationRetryAction(value, null, false, false, false), "none");
    const observer = watch(t, client, translationSubmitOptions(value, null, submit));
    await observer.refetch();
    // Automatic mode must respect the same eligibility gate.
    if (value.values) {
      observer.setOptions(translationSubmitOptions({ ...value,
        values: { ...value.values, translationMode: "automatic" } }, null, submit));
      await observer.refetch();
    }
  }
  await settle();
  assert.equal(calls, 0);
});

test("host, agent, exact source and settings revision changes do not inherit manual authorization", async (t) => {
  const client = clientFor(t);
  let calls = 0;
  const submit = async () => { calls++; return queued; };
  const a = context();
  const intent = createTranslationIntent(a, 0, submit)!;
  const changes = [
    context({ hostId: "other-host" }), context({ agentId: "other-agent" }),
    context({ text: a.text + " " }), context({ revision: "2" }),
    context({ connection: { ...a.connection!, revision: "rotated-key-or-model" } }),
    context({ revision: null, values: null }),
  ];
  for (const changed of changes) {
    assert.notEqual(translationIdentity(changed), translationIdentity(a));
    const observer = watch(t, client, translationSubmitOptions(changed, intent, submit));
    await observer.refetch();
    const poll = watch(t, client, translationPollOptions(changed, intent, queued, async () => {
      throw new Error("Unauthorized polling");
    }));
    assert.equal(poll.getCurrentResult().fetchStatus, "idle");
  }
  await settle();
  assert.equal(calls, 0);
  // A manual remount starts without local click intent.
  watch(t, client, translationSubmitOptions(a, null, submit));
  await settle();
  assert.equal(calls, 0);
});

test("automatic mode still submits completed reasoning and history, but not on focus/reconnect", async (t) => {
  const client = clientFor(t);
  const a = context();
  const automatic = { ...a, values: { ...a.values!, translationMode: "automatic" as const } };
  let calls = 0;
  const submit = async () => { calls++; return queued; };
  watch(t, client, translationSubmitOptions(automatic, null, submit));
  watch(t, client, translationSubmitOptions({ ...automatic, text: "History" }, null, submit));
  await settle();
  assert.equal(calls, 2);
  focusManager.setFocused(false); focusManager.setFocused(true);
  onlineManager.setOnline(false); onlineManager.setOnline(true);
  await settle();
  assert.equal(calls, 2);
});

for (const retranslate of [false, true]) {
  test(`admitted manual ${retranslate ? "retranslation" : "translation"} polls through transport recovery without resubmission`, async (t) => {
  const client = clientFor(t);
  const a = context();
  let submits = 0;
  const submit = async () => { submits++; return queued; };
  const intent = createTranslationIntent(a, retranslate ? 1 : 0, submit, retranslate)!;
  const first = watch(t, client, translationSubmitOptions(a, intent, submit));
  await settle();
  let gets = 0;
  const getJob = async ({ jobId }: { jobId: string }) => {
    assert.equal(jobId, queued.jobId);
    if (++gets === 1) throw new Error("Offline");
    return ready;
  };
  const options = translationPollOptions(a, intent, first.getCurrentResult().data, getJob);
  const poll = watch(t, client, options);
  await settle();
  assert.equal(poll.getCurrentResult().isError, true);
  assert.equal(options.refetchInterval({ state: { status: "error" } }), false);
  assert.equal(translationRetryAction(a, intent, false, true, options.enabled), "poll");
  await poll.refetch();
  assert.deepEqual(poll.getCurrentResult().data, ready);
  assert.equal(options.refetchInterval({ state: { status: "success", data: ready } }), false);
  assert.equal(submits, 1);
  assert.equal(gets, 2);
  // Cached ready data remains available on a manual remount without polling or AI.
  watch(t, client, translationSubmitOptions(a, null, submit));
  const remount = watch(t, client, translationPollOptions(a, null, queued, getJob));
  await settle();
  assert.equal(remount.getCurrentResult().data?.translatedText, "译文");
  assert.equal(submits, 1);
  assert.equal(gets, 2);
  // A disabled polling query cannot be force-refetched by a retry handler either.
  await remount.refetch();
  assert.equal(gets, 2);
  });
}

test("submission/job errors require explicit retry, which sends retry=true once", async (t) => {
  const client = clientFor(t);
  const a = context();
  const retries: boolean[] = [];
  const submit = async ({ retry }: { retry: boolean }) => {
    retries.push(retry);
    if (retries.length === 1) throw new Error("Submission disconnected");
    return retries.length === 2 ? { ...queued, status: "error" as const, error: "Provider failed" } : ready;
  };
  let intent = createTranslationIntent(a, 0, submit)!;
  const observer = watch(t, client, translationSubmitOptions(a, intent, submit));
  await settle();
  assert.equal(observer.getCurrentResult().isError, true);
  await observer.refetch(); // Query/cache re-evaluation alone cannot spend again.
  assert.deepEqual(retries, [false]);
  assert.equal(translationRetryAction(a, intent, false, false, false), "submit");
  intent = createTranslationIntent(a, 1, submit)!;
  observer.setOptions(translationSubmitOptions(a, intent, submit));
  await settle();
  assert.equal(observer.getCurrentResult().data?.status, "error");
  intent = createTranslationIntent(a, 2, submit)!;
  observer.setOptions(translationSubmitOptions(a, intent, submit));
  await settle();
  assert.deepEqual(retries, [false, true, true]);
  assert.equal(observer.getCurrentResult().data?.translatedText, "译文");
});

test("manual pending cache can be remounted or replaced without submitting/polling", async (t) => {
  const client = clientFor(t);
  const a = context();
  let submits = 0;
  let gets = 0;
  const submit = async () => { submits++; return queued; };
  const getJob = async () => { gets++; return queued; };
  const options = translationSubmitOptions(a, null, submit);
  client.setQueryData(options.queryKey, queued);
  watch(t, client, options);
  watch(t, client, translationPollOptions(a, null, queued, getJob));
  await client.invalidateQueries();
  client.removeQueries({ queryKey: ["translation-submit"] });
  watch(t, client, options);
  await settle();
  assert.equal(submits, 0);
  assert.equal(gets, 0);
});

test("explicit retranslation uses a fresh query identity and one memoized submission with exact revision scope", async (t) => {
  const client = clientFor(t);
  const value = context();
  const calls: SubmitTranslationInput[] = [];
  const submit = async (input: SubmitTranslationInput) => { calls.push(input); return { ...ready, jobId: "fresh-job" }; };
  const normal = translationSubmitOptions(value, null, submit);
  client.setQueryData(normal.queryKey, ready);
  const observer = watch(t, client, normal);
  assert.equal(calls.length, 0);
  const intent = createTranslationIntent(value, 1, submit, true)!;
  const options = translationSubmitOptions(value, intent, submit);
  assert.notDeepEqual(options.queryKey, normal.queryKey);
  observer.setOptions(options);
  await settle();
  assert.equal(calls.length, 1);
  assert.ok(calls[0].retranslateId);
  assert.equal(calls[0].settingsRevision, value.revision);
  assert.equal(calls[0].connectionRevision, value.connection!.revision);
  await observer.refetch();
  assert.equal(calls.length, 1);
  const nextIntent = createTranslationIntent(value, 1, submit, true)!;
  assert.notDeepEqual(translationSubmitOptions(value, nextIntent, submit).queryKey, options.queryKey);
  const changed = { ...value, connection: { ...value.connection!, revision: "changed" } };
  const blocked = translationSubmitOptions(changed, intent, submit);
  assert.equal(blocked.enabled, false);
  await assert.rejects(blocked.queryFn());
  assert.equal(calls.length, 1);
  assert.equal(createTranslationIntent({ ...value, phase: "streaming" }, 1, submit, true), null);
  assert.equal(translationRetryAction(value, intent, false, true, true), "poll");
  const deliveryRetry = createTranslationIntent(value, 2, submit, intent.retranslateId!)!;
  await translationSubmitOptions(value, deliveryRetry, submit).queryFn();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].retranslateId, calls[0].retranslateId);
});

test("late old poll and replayed original submit cannot replace a newer retranslation in the read cache", async (t) => {
  const client = clientFor(t);
  const value = context();
  const old = { ...ready, jobId: "old-job", translatedText: "old JSON" };
  const fresh = { ...ready, jobId: "fresh-job", translatedText: "fresh translation" };
  let submits = 0;
  const submit = async () => ++submits === 1 ? old : fresh;
  const oldIntent = createTranslationIntent(value, 0, submit)!;
  const original = watch(t, client, translationSubmitOptions(value, oldIntent, submit));
  await settle();
  let finishOldPoll!: (job: TranslationJob) => void;
  const oldPoll = new Promise<TranslationJob>((resolve) => { finishOldPoll = resolve; });
  watch(t, client, translationPollOptions(value, oldIntent, { ...queued, jobId: old.jobId }, async () => oldPoll));
  const freshIntent = createTranslationIntent(value, 1, submit, true)!;
  watch(t, client, translationSubmitOptions(value, freshIntent, submit));
  await settle();
  const readOnly = watch(t, client, translationSubmitOptions(value, null, submit));
  assert.equal(readOnly.getCurrentResult().data?.translatedText, fresh.translatedText);
  finishOldPoll(old);
  await settle();
  assert.equal(readOnly.getCurrentResult().data?.translatedText, fresh.translatedText);
  await original.refetch();
  assert.equal(readOnly.getCurrentResult().data?.translatedText, fresh.translatedText);
  assert.equal(submits, 2);
});

for (const completion of ["submit", "poll"] as const) {
  test(`remount reads the latest retranslation from the base query after ${completion} completion without restoring authorization`, async (t) => {
    const client = clientFor(t);
    const value = context();
    const old = { ...ready, jobId: "old-job", translatedText: '{"sourceText":"old JSON"}' };
    const fresh = { ...ready, jobId: "fresh-job", translatedText: "最新重翻译文" };
    let submits = 0;
    let polls = 0;
    const submit = async () => ++submits === 1 ? old : completion === "submit" ? fresh : { ...queued, jobId: fresh.jobId };
    const original = watch(t, client, translationSubmitOptions(value, createTranslationIntent(value, 0, submit), submit));
    await settle();
    assert.equal(original.getCurrentResult().data?.translatedText, old.translatedText);
    original.destroy();
    const intent = createTranslationIntent(value, 1, submit, true)!;
    const action = watch(t, client, translationSubmitOptions(value, intent, submit));
    await settle();
    let finishPoll!: (job: TranslationJob) => void;
    const pollResult = new Promise<TranslationJob>((resolve) => { finishPoll = resolve; });
    const getJob = async () => { polls++; return pollResult; };
    const polling = completion === "poll"
      ? watch(t, client, translationPollOptions(value, intent, action.getCurrentResult().data, getJob)) : null;
    await settle();
    // Follow the component's actual data path: no hardcoded job supplied to its read-only poll.
    const remount = watch(t, client, translationSubmitOptions(value, null, submit));
    assert.equal(remount.getCurrentResult().data?.jobId, fresh.jobId);
    const readOnlyPoll = translationPollOptions(value, null, remount.getCurrentResult().data, getJob);
    assert.equal(readOnlyPoll.enabled, false);
    const readOnlyPolling = watch(t, client, readOnlyPoll);
    if (completion === "poll") {
      assert.equal(remount.getCurrentResult().data?.status, "queued");
      finishPoll(fresh);
      await settle();
      assert.equal(polling!.getCurrentResult().data?.status, "ready");
    }
    assert.equal(remount.getCurrentResult().data?.translatedText, fresh.translatedText);
    action.destroy();
    polling?.destroy();
    await remount.refetch();
    await readOnlyPolling.refetch();
    await client.invalidateQueries();
    await settle();
    assert.equal(submits, 2);
    assert.equal(polls, completion === "poll" ? 1 : 0);
    const changed = { ...value, connection: { ...value.connection!, revision: "other-connection" } };
    const unrelated = watch(t, client, translationSubmitOptions(changed, null, submit));
    assert.equal(unrelated.getCurrentResult().data, undefined);
  });
}

test("shared connection metadata refresh changes identity but never spends manual authorization", async (t) => {
  const client = clientFor(t);
  const base = context();
  let metadata = base.connection!;
  let submits = 0;
  const submit = async () => { submits++; return queued; };
  const row = watch(t, client, translationSubmitOptions({ ...base, connection: null }, null, submit));
  const metadataQuery = new QueryObserver(client, connectionQueryOptions(base.hostId, async () => metadata));
  const off = metadataQuery.subscribe(() => {
    row.setOptions(translationSubmitOptions({ ...base, connection: metadataQuery.getCurrentResult().data ?? null }, null, submit));
  });
  cleanups.get(client)!.push(() => { off(); metadataQuery.destroy(); });
  await settle();
  metadata = { ...metadata, revision: "new-model-or-key-revision" };
  await metadataQuery.refetch();
  await settle();
  assert.equal(submits, 0);
  const oldIdentity = translationSubmitOptions(base, null, submit).queryKey;
  const freshIdentity = translationSubmitOptions({ ...base, connection: metadata }, null, submit).queryKey;
  assert.notDeepEqual(oldIdentity, freshIdentity);
  assert.equal(JSON.stringify(freshIdentity).includes("apiKey"), false);
});
