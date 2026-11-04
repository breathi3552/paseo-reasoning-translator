import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ConnectionStore, normalizeConnection } from "./connection";
import { DEFAULT_CONNECTION } from "../shared/connection";

test("private connection is lazy, atomically saved, revision checked and never returns its key in metadata", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "think-what-connection-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, "private");
  const store = new ConnectionStore({ directory });
  const initial = await store.metadata();
  assert.equal(initial.format, "gemini");
  assert.equal(initial.model, "gemini-3.5-flash-lite");
  assert.equal(initial.hasApiKey, false);
  await assert.rejects(access(directory));
  let changes = 0;
  store.subscribe(() => { changes++; });
  const saved = await store.save({ ...initial, expectedRevision: initial.revision,
    key: { action: "replace", value: "test-secret-not-a-real-key" } });
  assert.equal(saved.hasApiKey, true);
  assert.equal(JSON.stringify(saved).includes("test-secret"), false);
  assert.equal((await store.read()).apiKey, "test-secret-not-a-real-key");
  const stored = JSON.parse(await readFile(join(directory, "connection.json"), "utf8"));
  assert.equal(stored.apiKey, "test-secret-not-a-real-key");
  if (process.platform !== "win32") assert.equal((await stat(join(directory, "connection.json"))).mode & 0o777, 0o600);
  await assert.rejects(store.save({ ...saved, expectedRevision: initial.revision, key: { action: "delete" } }), /changed|冲突/);
  assert.equal(changes, 1);
  await assert.rejects(store.save({ ...saved, baseUrl: "https://other.example/v1", expectedRevision: saved.revision,
    key: { action: "keep" } }), /重新输入|re-enter/);
  const updated = await store.save({ ...saved, model: "another-model", expectedRevision: saved.revision, key: { action: "keep" } });
  assert.equal(updated.hasApiKey, true);
  assert.notEqual(updated.revision, saved.revision);
});

test("URL validation preserves version paths, allows loopback HTTP only and prevents model path traversal", () => {
  for (const baseUrl of ["https://api.sensenova.cn/compatible-mode/v2/", "http://127.0.0.1:8888/custom/v1", "http://[::1]:8888/v1", "http://localhost:8888/v1"]) {
    assert.equal(normalizeConnection({ format: "openai", baseUrl, model: "user/model-id" }).baseUrl, baseUrl.replace(/\/+$/, ""));
  }
  for (const baseUrl of ["http://public.example/v1", "https://user:secret@example.com", "https://example.com?v=secret", "https://example.com#secret", "file:///secret", "http://localhost.evil/v1", "http://127.0.0.1.evil/v1"]) {
    assert.throws(() => normalizeConnection({ ...DEFAULT_CONNECTION, baseUrl }), (error: Error) => !error.message.includes("secret"));
  }
  for (const model of ["../escape", "foo/bar", "foo?key=secret", "%2fescape", "a:b"]) {
    assert.throws(() => normalizeConnection({ ...DEFAULT_CONNECTION, model }));
  }
});

test("concurrent connection saves have one winner; endpoint key transfer is explicit and deletion is public-only", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "think-what-cas-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new ConnectionStore({ directory });
  const initial = await store.metadata();
  const input = { ...initial, expectedRevision: initial.revision, key: { action: "replace" as const, value: "offline-test-key" } };
  const results = await Promise.allSettled([store.save(input), store.save(input)]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const saved = await store.metadata();
  const changed = await store.save({ ...saved, format: "openai", baseUrl: "https://api.sensenova.cn/compatible-mode/v2", model: "", expectedRevision: saved.revision,
    key: { action: "replace", value: "different-test-key" } });
  assert.equal(changed.model, "");
  const deleted = await store.save({ ...changed, expectedRevision: changed.revision, key: { action: "delete" } });
  assert.equal(deleted.hasApiKey, false);
  assert.equal((await store.read()).apiKey, null);
  assert.equal(JSON.stringify(deleted).includes("different-test-key"), false);
});

test("corrupt credential files fail without exposing private file contents or creating replacements", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "think-what-corrupt-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "connection.json");
  await writeFile(file, "private-key-and-source-not-json");
  const store = new ConnectionStore({ directory });
  await assert.rejects(store.metadata(), (error: Error) => !error.message.includes("private-key"));
  assert.equal(await readFile(file, "utf8"), "private-key-and-source-not-json");
});
