import assert from "node:assert/strict";
import test from "node:test";
import type { PluginHandlerContext, PluginServerContext } from "@getpaseo/plugin/server";
import type { PluginRpcContract } from "@getpaseo/plugin";
import contribute from "../index.server";
import { clearTranslationCache, getTranslation, getConnection, saveConnection, submitTranslation } from "../shared/rpc";
import { translationSettings } from "../shared/settings";
import { MemorySettings } from "./test-helpers";

// Connection RPCs are exercised against temporary stores separately, never real daemon files.
test("entry registers HTTP-only contracts and never touches Paseo agents/workspaces", async () => {
  const settings = new MemorySettings();
  await settings.change({ enabled: false });
  const handlers = new Map<string, { contract: PluginRpcContract; handler: (input: unknown, context: PluginHandlerContext) => unknown }>();
  const context = {
    registerSettings(definition: unknown) { assert.equal(definition, translationSettings); return settings; },
    handle(contract: PluginRpcContract, handler: (input: unknown, context: PluginHandlerContext) => unknown) {
      handlers.set(contract.name, { contract, handler });
    },
  } as unknown as PluginServerContext;
  const cleanup = contribute(context);
  const invoke = async (name: string, input: unknown) => {
    const { contract, handler } = handlers.get(name)!;
    const forbidden = new Proxy({}, { get() { throw new Error("Paseo API must not be accessed"); } });
    return contract.output.parse(await handler(contract.input.parse(input), forbidden as PluginHandlerContext));
  };
  assert.deepEqual([...handlers.keys()].sort(), [clearTranslationCache, getTranslation, getConnection, saveConnection, submitTranslation].map(({ name }) => name).sort());
  const result = await invoke(submitTranslation.name, { agentId: "source", text: "source", settingsRevision: "s", connectionRevision: "c" }) as { reason: string };
  assert.equal(result.reason, "disabled");
  assert.deepEqual(await invoke(clearTranslationCache.name, {}), { cleared: 0 });
  assert.equal((await invoke(getTranslation.name, { jobId: "unknown" }) as { reason: string }).reason, "job_expired");
  await cleanup();
  assert.equal(settings.listenerCount, 0);
});
