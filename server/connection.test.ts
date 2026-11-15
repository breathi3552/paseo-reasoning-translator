import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ConnectionStore } from "./connection";
import { createHttpTranslator, probeConnection, type HttpResponse } from "./http-translator";

async function withTempStore(run: (store: ConnectionStore, dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "paseo-conn-test-"));
  const store = new ConnectionStore({ directory: dir });
  try {
    await run(store, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("unconfigured store returns empty presets and creating a preset activates it without leaking apiKey in metadata", async () => {
  await withTempStore(async (store) => {
    const initial = await store.metadata();
    assert.equal(initial.activePresetId, null);
    assert.deepEqual(initial.presets, []);
    assert.equal(initial.hasApiKey, false);
    assert.equal(initial.revision, "unconfigured");

    const saved = await store.save({
      action: "create",
      expectedRevision: initial.revision,
      name: "Google Gemini",
      format: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-3.5-flash-lite",
      apiKey: "secret-key-1",
    });

    assert.equal(saved.presets.length, 1);
    assert.equal(saved.activePresetId, saved.presets[0].id);
    assert.equal(saved.presets[0].name, "Google Gemini");
    assert.equal(saved.presets[0].hasApiKey, true);
    assert.equal(saved.hasApiKey, true);
    assert.equal(JSON.stringify(saved).includes("secret-key-1"), false);

    const activePrivate = await store.read();
    assert.equal(activePrivate.format, "gemini");
    assert.equal(activePrivate.model, "gemini-3.5-flash-lite");
    assert.equal(activePrivate.revision, saved.revision);
  });
});

test("supports multiple independent presets, switching, updating, key protection, and deleting", async () => {
  await withTempStore(async (store) => {
    const init = await store.metadata();
    const afterFirst = await store.save({
      action: "create",
      expectedRevision: init.revision,
      name: "Gemini 主力",
      format: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-3.5-flash-lite",
      apiKey: "gemini-key",
    });
    const geminiId = afterFirst.presets[0].id;

    const afterSecond = await store.save({
      action: "create",
      expectedRevision: afterFirst.revision,
      name: "SenseNova 备用",
      format: "openai",
      baseUrl: "https://api.sensenova.cn/compatible-mode/v2",
      model: "SenseChat-5",
      apiKey: "sensenova-key",
    });
    assert.equal(afterSecond.presets.length, 2);
    const openaiId = afterSecond.presets[1].id;
    assert.equal(afterSecond.activePresetId, openaiId);
    assert.equal((await store.read()).apiKey, "sensenova-key");

    // Switching back to Gemini keeps both presets intact
    const afterSelect = await store.save({
      action: "select",
      expectedRevision: afterSecond.revision,
      id: geminiId,
    });
    assert.equal(afterSelect.activePresetId, geminiId);
    assert.equal(afterSelect.presets.length, 2);
    assert.equal((await store.read()).apiKey, "gemini-key");

    // Updating model only keeps existing key
    const afterUpdateModel = await store.save({
      action: "update",
      expectedRevision: afterSelect.revision,
      id: geminiId,
      name: "Gemini 2.5",
      format: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-2.5-flash",
      key: { action: "keep" },
    });
    assert.equal(afterUpdateModel.model, "gemini-2.5-flash");
    assert.equal((await store.read()).apiKey, "gemini-key");

    // Changing baseUrl without replacing key is rejected
    await assert.rejects(
      store.save({
        action: "update",
        expectedRevision: afterUpdateModel.revision,
        id: geminiId,
        name: "Gemini Proxy",
        format: "gemini",
        baseUrl: "https://proxy.example.com/v1beta",
        model: "gemini-2.5-flash",
        key: { action: "keep" },
      }),
      /重新输入/,
    );

    // Deleting active preset switches to remaining preset; deleting last leaves empty unconfigured state
    const afterDeleteOne = await store.save({
      action: "delete",
      expectedRevision: afterUpdateModel.revision,
      id: geminiId,
    });
    assert.equal(afterDeleteOne.presets.length, 1);
    assert.equal(afterDeleteOne.activePresetId, openaiId);
    assert.equal((await store.read()).apiKey, "sensenova-key");

    const afterDeleteLast = await store.save({
      action: "delete",
      expectedRevision: afterDeleteOne.revision,
      id: openaiId,
    });
    assert.equal(afterDeleteLast.presets.length, 0);
    assert.equal(afterDeleteLast.activePresetId, null);
    assert.equal(afterDeleteLast.hasApiKey, false);
    assert.equal((await store.read()).apiKey, null);
  });
});

test("migrates legacy v1 connection.json cleanly on read without writing, and enforces expectedRevision", async () => {
  await withTempStore(async (store, dir) => {
    await writeFile(
      join(dir, "connection.json"),
      JSON.stringify({
        format: "openai",
        baseUrl: "https://legacy.example.com/v1",
        model: "gpt-4o-mini",
        apiKey: "legacy-secret",
        revision: "legacy-rev-1",
      }),
    );

    const meta = await store.metadata();
    assert.equal(meta.revision, "legacy-rev-1");
    assert.equal(meta.presets.length, 1);
    assert.equal(meta.activePresetId, meta.presets[0].id);
    assert.equal(meta.format, "openai");
    assert.equal(meta.hasApiKey, true);

    await assert.rejects(
      store.save({
        action: "select",
        expectedRevision: "wrong-rev",
        id: meta.presets[0].id,
      }),
      /冲突/,
    );
  });
});

test("probeConnection resolves stored key for unchanged endpoint, blocks changed endpoint without new key, and leaves store untouched", async () => {
  await withTempStore(async (store) => {
    const init = await store.metadata();
    const created = await store.save({
      action: "create",
      expectedRevision: init.revision,
      name: "OpenAI",
      format: "openai",
      baseUrl: "https://api.example.com/v1",
      model: "gpt-4o-mini",
      apiKey: "stored-secret",
    });
    const presetId = created.presets[0].id;

    const seenHeaders: string[] = [];
    const runner = createHttpTranslator({
      fetch: async (_url, initFetch) => {
        seenHeaders.push(initFetch.headers.Authorization ?? "");
        return new Response(
          JSON.stringify({
            choices: [{ finish_reason: "stop", message: { role: "assistant", content: "OK" } }],
          }),
          { status: 200 },
        ) as unknown as HttpResponse;
      },
    });

    const okExisting = await probeConnection(store, runner, {
      presetId,
      format: "openai",
      baseUrl: "https://api.example.com/v1",
      model: "gpt-4o",
      key: { action: "keep" },
    });
    assert.deepEqual(okExisting, { status: "ok" });
    assert.deepEqual(seenHeaders, ["Bearer stored-secret"]);

    // Endpoint changed + keep must fail locally without sending stored-secret
    const blocked = await probeConnection(store, runner, {
      presetId,
      format: "openai",
      baseUrl: "https://evil.example.com/v1",
      model: "gpt-4o",
      key: { action: "keep" },
    });
    assert.equal(blocked.status, "invalid");
    assert.equal(seenHeaders.length, 1);

    // Store revision & model must not have been mutated by probe
    const after = await store.metadata();
    assert.equal(after.revision, created.revision);
    assert.equal(after.model, "gpt-4o-mini");
    await runner.close();
  });
});
