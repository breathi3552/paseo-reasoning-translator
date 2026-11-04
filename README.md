# Paseo Think What · 思考过程翻译

Translate Paseo’s visible reasoning with direct HTTP calls to Google Gemini `generateContent` or an OpenAI-compatible Chat Completions endpoint. Manual, per-block translation is the default.

## 使用

需要 Paseo daemon 与客户端 **0.15.0+**。从侧边栏「思考翻译」、命令中心或插件设置打开设置页。

1. 配置一个 HTTP 连接，填写接口格式、Base URL、模型 ID 和 API key，点击「保存连接」。保存不发送测试请求。
2. 开启「启用思考翻译」。默认仍是**手动点击**：完整思考块点击「翻译」才发送该块；打开历史、流式结束、重渲染和恢复焦点不会自动排队。
3. 如需自动提交完成的新思考与已加载历史，选择「自动翻译」。
4. 译文原位显示并支持 Markdown；保留「显示原文 / 显示译文」、折叠和流式原文。提交期间禁止重复点击。进度查询失败时优先恢复同一 job，不重新发送模型请求。

### 连接格式

| 格式 | Base URL | 模型 |
|---|---|---|
| Gemini 原生（默认） | `https://generativelanguage.googleapis.com/v1beta` | `gemini-3.5-flash-lite`（默认，可编辑） |
| OpenAI 兼容 | 用户填写，例：`https://api.sensenova.cn/compatible-mode/v2` | 用户填写账户可用的准确 ID；不猜测 SenseNova 模型 |

- OpenAI 在 Base URL 后追加 `/chat/completions`，不追加或替换版本号。请求使用 Bearer key，仅发送 `model`、system/user `messages` 和 `stream:false`。
- Gemini 在 Base URL 后追加 `/models/{model}:generateContent`，使用 `x-goog-api-key` 请求头。仅发送 `systemInstruction` 和 user `contents`，不发送采样、thinking、prefill 或工具参数。
- URL 由 **daemon** 访问，只允许 HTTPS 或 loopback HTTP；禁止 userinfo、query 和 fragment。Gemini 填写模型 ID，不填写 URL 路径。
- 只有一个当前连接，不管理多个 profile。更改格式或 Base URL 不能保留原 key，必须重新输入或删除；同目标仅改模型可保留 key。

### 凭据与隐私

API key 不在普通 host settings 中，也不通过元数据 RPC 返回。它保存在 daemon 的：

```text
${PASEO_HOME}/plugin-data/paseo-think-what/connection.json
# PASEO_HOME 未指定时，使用 ~/.paseo
```

仅点击保存时写文件，完整连接按 revision 检查冲突并原子替换。目录权限尽力设为 `0700`，文件为 `0600`；**这是未加密的本机文件，不是 OS vault**。保存成功后清空 key 输入，失败保留输入供重试。设置页可删除已保存的 key。

插件只向所选 API 发送目标语言和宿主公开的 reasoning 文本，不读取额外上下文，不创建 Paseo agent/workspace，不使用工具或 MCP。模型调用消耗对应 API 账户额度，提供商可能按其条款留存文本。错误不转发原始响应体或凭据，插件不记录正文或 key 日志。

### 任务与限制

- 单条原文最多 **200,000 字符**；超过 **12,000 字符**按段落拆分、串行翻译并按序拼接，保留所有源字符。
- 等待队列最多 **64**，HTTP 并发 **1**；进程内结果缓存最多 **128** 条，TTL **30 分钟**。
- 每次 HTTP 请求（含读取响应体）限时 **120 秒**，响应体最多 **2,000,000 字节**，译文最多 **1,000,000 字符**。
- 网络失败、限流、空文本、拒绝、截断或工具响应均明确失败，不自动重发。Gemini thought 和 OpenAI reasoning 字段不会当作译文。
- 连接、模型、key 或普通设置变化会取消旧 HTTP、撤销旧任务和缓存。手动授权绑定 host、agent、准确原文及两种设置 revision；新连接需重新点击。
- 客户端约每 **5 秒**刷新无 key 的连接元数据；服务端再次检查提交 revision，旧客户端授权不能静默用于新配置。
- 清理缓存取消旧任务，不自动重新提交。缓存仅在插件内存中，停止插件后丢失。

## 开发与离线验证

```bash
npm run typecheck
npm test
rg -n "document\.|window\.|localStorage|navigator\.|<[a-z]+[ >]|className=|onClick=" client/
```

测试使用注入 fetch、loopback HTTP server 和临时目录；不需要真实 key，不请求公网模型。

```text
client/settings.tsx          # RN 设置页、masked key 输入与保存状态
client/timeline.tsx          # 原文/译文、逐块授权、轮询与折叠
client/connection.ts         # 共享元数据查询，无 key
server/connection.ts         # 私有连接文件、校验、revision、原子写入
server/http-translator.ts    # 两种 HTTP 协议、响应提取、deadline/abort
server/translation-service.ts # 队列、分块、缓存、授权与撤销
shared/connection.ts         # 公开连接/保存输入契约
shared/settings.ts          # 非敏感 host settings
shared/rpc.ts               # 连接与任务 RPC
shared/translation-query.ts # timeline 实际查询门控
```

## English quick guide

Open Think what settings, save one HTTP connection, then enable translation. Manual mode sends only the completed reasoning block you click. Automatic mode also submits completed reasoning and loaded history. The default connection is native Gemini with `gemini-3.5-flash-lite`. For SenseNova, choose OpenAI-compatible format, use your account’s model ID, and enter the appropriate Base URL, such as `https://api.sensenova.cn/compatible-mode/v2`.

Keys are stored only in the daemon’s unencrypted connection file described above, not in host settings or readable metadata. Changing the endpoint or format requires a newly entered key or explicit deletion. Saving performs no model request. Connection changes cancel old work; HTTP failures never retry automatically. Requests use only the chosen API, with no Paseo agents, workspaces, tools or MCP. Provider billing and retention policies apply.
