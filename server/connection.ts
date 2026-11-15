import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isIP } from "node:net";
import { join } from "node:path";
import { URL } from "node:url";
import { z } from "zod";
import {
  DEFAULT_CONNECTION,
  MAX_PRESETS,
  connectionFieldsSchema,
  connectionFormatSchema,
  saveConnectionInputSchema,
  testConnectionInputSchema,
  type ConnectionFields,
  type ConnectionMetadata,
  type ConnectionPresetMetadata,
  type SaveConnectionInput,
  type TestConnectionInput,
} from "../shared/connection";

const privateV1Schema = connectionFieldsSchema
  .extend({ apiKey: z.string().nullable(), revision: z.string().min(1) })
  .strict();

const privatePresetSchema = z
  .object({
    id: z.string().min(1).max(128),
    name: z.string().trim().min(1).max(80),
    format: connectionFormatSchema,
    baseUrl: z.string().trim().max(2048),
    model: z.string().trim().max(200),
    apiKey: z.string().nullable(),
  })
  .strict();

const privateV2Schema = z
  .object({
    version: z.literal(2),
    activePresetId: z.string().min(1).max(128).nullable(),
    presets: z.array(privatePresetSchema).max(MAX_PRESETS),
    revision: z.string().min(1),
  })
  .strict();

export type PrivatePreset = z.output<typeof privatePresetSchema>;
export type PrivateConnectionStore = {
  activePresetId: string | null;
  presets: PrivatePreset[];
  revision: string;
};
export type PrivateConnection = ConnectionFields & {
  apiKey: string | null;
  revision: string;
};

export interface ConnectionSource {
  read(): Promise<PrivateConnection>;
  subscribe(listener: () => void): () => void;
}

export class ConnectionFailure extends Error {
  constructor(message: string, readonly kind: "conflict" | "invalid" | "error" = "error") {
    super(message);
  }
}

export function normalizePresetName(raw: string): string {
  const name = raw.trim();
  if (!name || name.length > 80 || /[\x00-\x1f\x7f]/.test(name)) {
    throw new ConnectionFailure("预设名称无效，请填写 1 至 80 个字符且不含控制字符", "invalid");
  }
  return name;
}

export function normalizeApiKey(raw: string): string {
  const apiKey = raw.trim();
  if (!apiKey || !/^[\x21-\x7e]+$/.test(apiKey)) {
    throw new ConnectionFailure("API key 必须为不含空白的可打印 ASCII 字符", "invalid");
  }
  return apiKey;
}

export function normalizeConnection(fields: ConnectionFields): ConnectionFields {
  let baseUrl = fields.baseUrl.trim();
  if (baseUrl) {
    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch {
      throw new ConnectionFailure("Base URL 格式无效", "invalid");
    }
    const loopback =
      url.hostname === "localhost" ||
      url.hostname === "[::1]" ||
      (isIP(url.hostname) === 4 && url.hostname.startsWith("127."));
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      baseUrl.includes("?") ||
      baseUrl.includes("#")
    ) {
      throw new ConnectionFailure(
        "Base URL 必须为 HTTPS（本机 loopback 可用 HTTP），且不能含账号、query 或 fragment",
        "invalid",
      );
    }
    baseUrl = url.toString().replace(/\/+$/, "");
  }
  const model = fields.model.trim();
  if (
    /[\x00-\x1f\x7f]/.test(model) ||
    (fields.format === "gemini" && model && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(model))
  ) {
    throw new ConnectionFailure("模型 ID 无效；Gemini 请填写模型 ID，不要填写路径", "invalid");
  }
  return { format: fields.format, baseUrl, model };
}

function resolvePresetKey(
  existing: PrivatePreset,
  fields: ConnectionFields,
  key: { action: "keep" } | { action: "replace"; value: string },
): string {
  if (key.action === "replace") {
    return normalizeApiKey(key.value);
  }
  if (existing.format !== fields.format || existing.baseUrl !== fields.baseUrl) {
    throw new ConnectionFailure("更改接口格式或 Base URL 后必须重新输入 API key", "invalid");
  }
  if (!existing.apiKey) {
    throw new ConnectionFailure("请输入 API key", "invalid");
  }
  return existing.apiKey;
}
function activePresetOf(store: PrivateConnectionStore): PrivatePreset | null {
  if (!store.activePresetId) return null;
  return store.presets.find((preset) => preset.id === store.activePresetId) ?? null;
}

export function publicConnection(value: PrivateConnection): ConnectionMetadata {
  return {
    format: value.format,
    baseUrl: value.baseUrl,
    model: value.model,
    hasApiKey: Boolean(value.apiKey),
    revision: value.revision,
    activePresetId: null,
    presets: [],
  };
}

export function publicConnectionStore(store: PrivateConnectionStore): ConnectionMetadata {
  const active = activePresetOf(store);
  const presets: ConnectionPresetMetadata[] = store.presets.map((preset) => ({
    id: preset.id,
    name: preset.name,
    format: preset.format,
    baseUrl: preset.baseUrl,
    model: preset.model,
    hasApiKey: Boolean(preset.apiKey),
  }));
  return {
    format: active?.format ?? DEFAULT_CONNECTION.format,
    baseUrl: active?.baseUrl ?? DEFAULT_CONNECTION.baseUrl,
    model: active?.model ?? DEFAULT_CONNECTION.model,
    hasApiKey: Boolean(active?.apiKey),
    revision: store.revision,
    activePresetId: active ? active.id : null,
    presets,
  };
}

/** The only credential owner. Reads never create files; a save replaces one complete document. */
export class ConnectionStore implements ConnectionSource {
  private readonly directory: string;
  private readonly file: string;
  private writing: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<() => void>();

  constructor(options: { directory?: string } = {}) {
    this.directory =
      options.directory ??
      join(process.env.PASEO_HOME || join(homedir(), ".paseo"), "plugin-data", "paseo-reasoning-translator");
    this.file = join(this.directory, "connection.json");
  }

  private async readStore(): Promise<PrivateConnectionStore> {
    try {
      if ((await stat(this.file)).size > 262_144) throw new Error("oversized");
      const raw = JSON.parse(await readFile(this.file, "utf8"));
      const v2 = privateV2Schema.safeParse(raw);
      if (v2.success) {
        const presets = v2.data.presets.map((preset) => {
          const fields = normalizeConnection(preset);
          return {
            id: preset.id,
            name: normalizePresetName(preset.name),
            ...fields,
            apiKey: preset.apiKey ? normalizeApiKey(preset.apiKey) : null,
          };
        });
        const activePresetId =
          v2.data.activePresetId && presets.some((p) => p.id === v2.data.activePresetId)
            ? v2.data.activePresetId
            : presets[0]?.id ?? null;
        return { activePresetId, presets, revision: v2.data.revision };
      }

      const v1 = privateV1Schema.parse(raw);
      const fields = normalizeConnection(v1);
      const apiKey = v1.apiKey ? normalizeApiKey(v1.apiKey) : null;
      const isEmptyDefault =
        apiKey === null &&
        fields.format === DEFAULT_CONNECTION.format &&
        fields.baseUrl === DEFAULT_CONNECTION.baseUrl &&
        fields.model === DEFAULT_CONNECTION.model;
      if (isEmptyDefault) {
        return { activePresetId: null, presets: [], revision: v1.revision };
      }
      const preset: PrivatePreset = {
        id: "default",
        name: fields.format === "gemini" ? "Google Gemini" : "OpenAI",
        ...fields,
        apiKey,
      };
      return { activePresetId: preset.id, presets: [preset], revision: v1.revision };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { activePresetId: null, presets: [], revision: "unconfigured" };
      }
      throw new ConnectionFailure("无法读取本机连接文件，请检查文件权限和连接配置");
    }
  }

  async read(): Promise<PrivateConnection> {
    const store = await this.readStore();
    const active = activePresetOf(store);
    if (!active) {
      return { ...DEFAULT_CONNECTION, apiKey: null, revision: store.revision };
    }
    return {
      format: active.format,
      baseUrl: active.baseUrl,
      model: active.model,
      apiKey: active.apiKey,
      revision: store.revision,
    };
  }

  async metadata(): Promise<ConnectionMetadata> {
    return publicConnectionStore(await this.readStore());
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async resolveTestConnection(input: TestConnectionInput): Promise<PrivateConnection> {
    const parsed = testConnectionInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ConnectionFailure("连接字段格式无效，请检查输入", "invalid");
    }
    const data = parsed.data;
    const fields = normalizeConnection({
      format: data.format,
      baseUrl: data.baseUrl,
      model: data.model,
    });
    if (!fields.baseUrl || !fields.model) {
      throw new ConnectionFailure("请填写完整的 Base URL 和模型 ID", "invalid");
    }
    let apiKey: string;
    if (data.key.action === "replace") {
      apiKey = normalizeApiKey(data.key.value);
    } else {
      if (!data.presetId) {
        throw new ConnectionFailure("请输入 API key", "invalid");
      }
      const store = await this.readStore();
      const existing = store.presets.find((p) => p.id === data.presetId);
      if (!existing) {
        throw new ConnectionFailure("预设不存在，请重新加载后再试", "invalid");
      }
      apiKey = resolvePresetKey(existing, fields, data.key);
    }
    return { ...fields, apiKey, revision: "test" };
  }

  save(input: SaveConnectionInput): Promise<ConnectionMetadata> {
    const task = this.writing.then(() => this.persist(input));
    this.writing = task.then(
      () => {},
      () => {},
    );
    return task;
  }

  private async writeStore(store: PrivateConnectionStore): Promise<void> {
    const document = {
      version: 2 as const,
      activePresetId: store.activePresetId,
      presets: store.presets,
      revision: store.revision,
    };
    const temporary = join(this.directory, `connection.${randomUUID()}.tmp`);
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      await chmod(this.directory, 0o700).catch(() => {});
      await writeFile(temporary, JSON.stringify(document) + "\n", { mode: 0o600, flag: "wx" });
      await rename(temporary, this.file);
      await chmod(this.file, 0o600).catch(() => {});
    } catch {
      throw new ConnectionFailure("保存本机连接文件失败，请检查磁盘与文件权限");
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
    }
    for (const listener of this.listeners) listener();
  }

  private async persist(input: SaveConnectionInput): Promise<ConnectionMetadata> {
    const parsed = saveConnectionInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ConnectionFailure("连接字段格式无效，请检查输入", "invalid");
    }
    const data = parsed.data;
    const previous = await this.readStore();
    if (previous.revision !== data.expectedRevision) {
      throw new ConnectionFailure("连接配置已更新（保存冲突），请重新加载后再保存", "conflict");
    }

    if (data.action === "select") {
      const target = previous.presets.find((p) => p.id === data.id);
      if (!target) {
        throw new ConnectionFailure("预设不存在，请重新加载后再试", "invalid");
      }
      if (previous.activePresetId === target.id) {
        return publicConnectionStore(previous);
      }
      const next: PrivateConnectionStore = {
        activePresetId: target.id,
        presets: previous.presets,
        revision: randomUUID(),
      };
      await this.writeStore(next);
      return publicConnectionStore(next);
    }

    if (data.action === "delete") {
      const exists = previous.presets.some((p) => p.id === data.id);
      if (!exists) {
        throw new ConnectionFailure("预设不存在，请重新加载后再试", "invalid");
      }
      const presets = previous.presets.filter((p) => p.id !== data.id);
      const activePresetId =
        previous.activePresetId === data.id ? presets[0]?.id ?? null : previous.activePresetId;
      const next: PrivateConnectionStore = {
        activePresetId,
        presets,
        revision: randomUUID(),
      };
      await this.writeStore(next);
      return publicConnectionStore(next);
    }

    if (data.action === "create") {
      if (previous.presets.length >= MAX_PRESETS) {
        throw new ConnectionFailure("预设数量已达上限（最多 50 个）", "invalid");
      }
      const name = normalizePresetName(data.name);
      const fields = normalizeConnection({
        format: data.format,
        baseUrl: data.baseUrl,
        model: data.model,
      });
      if (!fields.baseUrl || !fields.model) {
        throw new ConnectionFailure("请填写完整的 Base URL 和模型 ID", "invalid");
      }
      const apiKey = normalizeApiKey(data.apiKey);
      const preset: PrivatePreset = {
        id: randomUUID(),
        name,
        ...fields,
        apiKey,
      };
      const next: PrivateConnectionStore = {
        activePresetId: preset.id,
        presets: [...previous.presets, preset],
        revision: randomUUID(),
      };
      await this.writeStore(next);
      return publicConnectionStore(next);
    }

    // data.action === "update"
    const idx = previous.presets.findIndex((p) => p.id === data.id);
    if (idx === -1) {
      throw new ConnectionFailure("预设不存在，请重新加载后再试", "invalid");
    }
    const existing = previous.presets[idx];
    const name = normalizePresetName(data.name);
    const fields = normalizeConnection({
      format: data.format,
      baseUrl: data.baseUrl,
      model: data.model,
    });
    if (!fields.baseUrl || !fields.model) {
      throw new ConnectionFailure("请填写完整的 Base URL 和模型 ID", "invalid");
    }
    const apiKey = resolvePresetKey(existing, fields, data.key);
    const updated: PrivatePreset = {
      id: existing.id,
      name,
      ...fields,
      apiKey,
    };
    const presets = previous.presets.map((p, i) => (i === idx ? updated : p));
    const next: PrivateConnectionStore = {
      activePresetId: previous.activePresetId,
      presets,
      revision: randomUUID(),
    };
    await this.writeStore(next);
    return publicConnectionStore(next);
  }
}
