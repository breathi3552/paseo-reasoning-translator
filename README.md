# Paseo Reasoning Translator · 思考翻译

通过直接调用 Google Gemini `generateContent` 或 OpenAI 兼容 Chat Completions 接口，在 Paseo 会话时间线中翻译模型思考块。默认采用手动、按块触发。

## 使用步骤

需要 Paseo daemon 与客户端 **0.15.0+**。从侧边栏 **思考翻译**、命令中心或插件设置打开设置页。

1. 在 **接口连接** 中选择接口格式，填写 **Base URL**、**模型 ID** 和 **API Key**，点击 **保存连接**。保存不会发送测试请求。
2. 开启 **启用思考翻译**。默认方式为 **手动点击**：仅在思考块生成完毕后，点击该块上的 **翻译** 才会提交请求；打开历史记录、等待思考生成或切换窗口焦点均不会自动排队。
3. 如需自动翻译已完成的新思考块与已加载的历史记录，将 **翻译方式** 改为 **自动翻译**。
4. 译文在原位以 Markdown 渲染，支持 **显示原文** / **显示译文** 切换、折叠展开以及流式输出原文。提交期间禁止重复点击；进度查询失败时点击 **继续查询** 会恢复同一任务，不会重新发送模型请求。

## 连接格式

| 格式 | Base URL | 模型 |
|---|---|---|
| Gemini 原生（默认） | `https://generativelanguage.googleapis.com/v1beta` | `gemini-3.5-flash-lite`（默认，可编辑） |
| OpenAI 兼容 | 用户填写（例：`https://api.sensenova.cn/compatible-mode/v2`） | 用户填写账户可用的准确模型 ID |

- **OpenAI 兼容**：在 Base URL 后直接追加 `/chat/completions`，不改动或替换原有版本号。请求使用 `Authorization: Bearer <API_KEY>`，仅发送 `model`、system/user `messages` 与 `stream: false`。
- **Gemini 原生**：在 Base URL 后追加 `/models/{model}:generateContent`，使用 `x-goog-api-key` 请求头。仅发送 `systemInstruction` 与 user `contents`，不发送采样参数、thinking 配置、prefill 或工具参数。
- **URL 校验**：URL 由 daemon 发起访问，只允许 HTTPS 或本机 loopback HTTP；禁止包含账号信息、query 参数和 fragment。Gemini 格式只需填写模型 ID，不要填写完整路径。
- **单连接管理**：仅保存一个当前连接。更改接口格式或 Base URL 时必须重新输入或删除 API key；同一目标仅修改模型 ID 可保留原有 key。

## 凭据与隐私

API key 不会保存在宿主设置中，也不通过元数据 RPC 返回。它保存在 daemon 所在机器的：

```text
${PASEO_HOME}/plugin-data/paseo-reasoning-translator/connection.json
# 未设置 PASEO_HOME 时，使用 ~/.paseo/plugin-data/paseo-reasoning-translator/connection.json
```

仅点击 **保存连接** 时写入文件，写入前校验 `revision` 冲突并执行原子替换。目录权限尽力设为 `0700`，文件权限尽力设为 `0600`。**这是未加密的本机文件，不是系统密码库。** 保存成功后清空输入框中的 key，失败则保留输入供重试。你随时可以在设置页删除已保存的 key。

插件只向所选接口发送目标语言和宿主公开的思考文本，不读取其他会话上下文，不创建 Paseo agent 或 workspace，也不使用工具或 MCP。模型调用消耗对应 API 账户额度，提供商可能按其条款留存请求内容。插件不把原始响应体、正文或凭据写入日志，也不向客户端透传原始错误体。

## 任务与限制

- **长度与分块**：单条原文上限 **200,000 字符**；超过 **12,000 字符** 时按段落拆分、串行翻译并按序拼接，保留所有源字符。
- **队列与缓存**：等待队列上限 **64**，HTTP 并发 **1**；进程内缓存最多 **128** 条，有效期 **30 分钟**。缓存仅在内存中，插件停止后丢失；清理缓存会取消旧任务，不自动重发。
- **超时与上限**：单次 HTTP 请求（含读取响应体）限时 **120 秒**，响应体上限 **2,000,000 字节**，译文上限 **1,000,000 字符**。
- **失败处理**：网络异常、限流、空文本、模型拒绝、输出截断或返回工具调用均明确报错，不自动重发。Gemini `thought` 字段和 OpenAI `reasoning` 字段不会当作译文显示。
- **配置变更与授权**：连接、模型、key 或插件设置变化会立即取消旧请求、作废旧任务与缓存。手动点击绑定当前 host、agent、准确原文以及 `settingsRevision` 和 `connectionRevision`；客户端每 **5 秒** 刷新无 key 元数据，服务端也会拒绝过期 revision 的提交。

## 仓库结构

```text
index.client.tsx              # 客户端插件入口（注册时间线拦截、设置页、侧边栏与命令）
index.server.ts               # 服务端插件入口（注册 RPC 与生命周期管理）
client/
  timeline.tsx                # 思考块渲染、原文/译文切换、折叠与按块授权
  settings.tsx                # React Native 设置页、masked key 输入与保存状态
  sidebar.tsx                 # 侧边栏入口组件
  connection.ts               # 无 key 连接元数据查询封装
  i18n.tsx                    # 中英文界面文案
server/
  connection.ts               # 本机连接文件读写、校验、revision 与原子替换
  http-translator.ts          # Gemini/OpenAI HTTP 协议封装、提取与超时取消
  translation-service.ts      # 任务队列、分块翻译、内存缓存与 revision 鉴权
  chunks.ts                   # 长文本按段落拆分工具
  test-helpers.ts             # 测试辅助工具（注入 fetch 与临时目录）
  *.test.ts                   # 服务端与渲染测试
shared/
  connection.ts               # 公开连接与保存输入契约
  settings.ts                 # 非敏感宿主设置 schema
  rpc.ts                      # 连接与翻译任务 RPC 定义
  timeline.ts                 # 时间线项数据 schema
  translation-query.ts        # 时间线查询门控逻辑
```

## 本地验证

```bash
npm run typecheck
npm test
# 检查 client/ 下未引入 Web DOM API 或事件属性（宿主为 React Native）
rg -n "document\.|window\.|localStorage|navigator\.|<[a-z]+[ >]|className=|onClick=" client/
```

测试使用注入的 `fetch`、loopback HTTP server 和临时目录，不需要真实 API key，也不会向公网发送模型请求。

英文简介见 [OVERVIEW.md](OVERVIEW.md)。
