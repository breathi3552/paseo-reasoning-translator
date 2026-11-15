import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isIP } from "node:net";
import { join } from "node:path";
import { URL } from "node:url";
import { z } from "zod";
import {
  DEFAULT_CONNECTION, connectionFieldsSchema, saveConnectionInputSchema,
  type ConnectionFields, type ConnectionMetadata, type SaveConnectionInput,
} from "../shared/connection";

const privateSchema = connectionFieldsSchema.extend({ apiKey: z.string().nullable(), revision: z.string().min(1) }).strict();
export type PrivateConnection = z.output<typeof privateSchema>;
export interface ConnectionSource {
  read(): Promise<PrivateConnection>;
  subscribe(listener: () => void): () => void;
}
export class ConnectionFailure extends Error {
  constructor(message: string, readonly kind: "conflict" | "invalid" | "error" = "error") { super(message); }
}
export function normalizeConnection(fields: ConnectionFields): ConnectionFields {
  let baseUrl = fields.baseUrl.trim();
  if (baseUrl) {
    let url: URL;
    try { url = new URL(baseUrl); } catch { throw new ConnectionFailure("Base URL 格式无效", "invalid"); }
    const loopback = url.hostname === "localhost" || url.hostname === "[::1]" ||
      (isIP(url.hostname) === 4 && url.hostname.startsWith("127."));
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username || url.password || url.search || url.hash || baseUrl.includes("?") || baseUrl.includes("#")) {
      throw new ConnectionFailure("Base URL 必须为 HTTPS（本机 loopback 可用 HTTP），且不能含账号、query 或 fragment", "invalid");
    }
    baseUrl = url.toString().replace(/\/+$/, "");
  }
  const model = fields.model.trim();
  if (/[\x00-\x1f\x7f]/.test(model) || (fields.format === "gemini" && model && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(model))) {
    throw new ConnectionFailure("模型 ID 无效；Gemini 请填写模型 ID，不要填写路径", "invalid");
  }
  return { format: fields.format, baseUrl, model };
}
export function publicConnection(value: PrivateConnection): ConnectionMetadata {
  return { format: value.format, baseUrl: value.baseUrl, model: value.model,
    hasApiKey: Boolean(value.apiKey), revision: value.revision };
}

/** The only credential owner. Reads never create files; a save replaces one complete document. */
export class ConnectionStore implements ConnectionSource {
  private readonly directory: string;
  private readonly file: string;
  private writing: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  constructor(options: { directory?: string } = {}) {
    this.directory = options.directory ?? join(process.env.PASEO_HOME || join(homedir(), ".paseo"), "plugin-data", "paseo-reasoning-translator");
    this.file = join(this.directory, "connection.json");
  }
  async read(): Promise<PrivateConnection> {
    try {
      if ((await stat(this.file)).size > 32_768) throw new Error("oversized");
      const value = privateSchema.parse(JSON.parse(await readFile(this.file, "utf8")));
      normalizeConnection(value);
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { ...DEFAULT_CONNECTION, apiKey: null, revision: "unconfigured" };
      }
      throw new ConnectionFailure("无法读取本机连接文件，请检查文件权限和连接配置");
    }
  }
  async metadata(): Promise<ConnectionMetadata> { return publicConnection(await this.read()); }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  save(input: SaveConnectionInput): Promise<ConnectionMetadata> {
    const task = this.writing.then(() => this.persist(input));
    this.writing = task.then(() => {}, () => {});
    return task;
  }
  private async persist(input: SaveConnectionInput): Promise<ConnectionMetadata> {
    const parsed = saveConnectionInputSchema.safeParse(input);
    if (!parsed.success) throw new ConnectionFailure("连接字段格式无效，请检查输入", "invalid");
    const fields = normalizeConnection(parsed.data);
    const previous = await this.read();
    if (previous.revision !== input.expectedRevision) {
      throw new ConnectionFailure("连接配置已更新（保存冲突），请重新加载后再保存", "conflict");
    }
    const key = parsed.data.key;
    if (key.action === "keep" && previous.apiKey &&
      (previous.format !== fields.format || previous.baseUrl !== fields.baseUrl)) {
      throw new ConnectionFailure("更改接口格式或 Base URL 后必须重新输入或删除 API key", "invalid");
    }
    const apiKey = key.action === "delete" ? null : key.action === "replace" ? key.value.trim() : previous.apiKey;
    if (apiKey !== null && !/^[\x21-\x7e]+$/.test(apiKey)) {
      throw new ConnectionFailure("API key 必须为不含空白的可打印 ASCII 字符", "invalid");
    }
    const next: PrivateConnection = { ...fields, apiKey, revision: randomUUID() };
    const temporary = join(this.directory, `connection.${randomUUID()}.tmp`);
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      await chmod(this.directory, 0o700).catch(() => {});
      await writeFile(temporary, JSON.stringify(next) + "\n", { mode: 0o600, flag: "wx" });
      await rename(temporary, this.file);
      await chmod(this.file, 0o600).catch(() => {});
    } catch {
      throw new ConnectionFailure("保存本机连接文件失败，请检查磁盘与文件权限");
    } finally { await rm(temporary, { force: true }).catch(() => {}); }
    for (const listener of this.listeners) listener();
    return publicConnection(next);
  }
}
