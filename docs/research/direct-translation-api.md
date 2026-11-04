# 原型期直接 API 翻译一手事实调研报告（Gemini 原生 HTTP 与 OpenAI 兼容）

- **查阅日期**：2026-11-04（依据当前系统本机时间核验）
- **调研范围**：Google Gemini 原生 HTTP `generateContent` 接口（重点 `gemini-3.5-flash-lite`）与 OpenAI 官方 Chat Completions 标准接口（含商汤 SenseNova 日日新兼容模式）
- **核心原则**：不实现代码，不修改项目已有源码与依赖，纯一手官方文档验证，不采纳未经证明的二手猜测；所有事实标注“已核实”或“待核实”，源不可访问明确记录。

---

## 一、 Google Gemini 原生 HTTP 接口（generateContent）一手核查

### 1.1 端点、域名与鉴权（已核实）
- **HTTP 域名**：`generativelanguage.googleapis.com`
- **请求端点**：`POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
  - 针对 Gemini 3.5 Flash-Lite 的完整路径示例：
    `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent`
- **鉴权 Header**：
  - 官方标准 Header：`-H "x-goog-api-key: {GEMINI_API_KEY}"`
  - URL Query 参数支持：`?key={GEMINI_API_KEY}`（亦受官方文档支持，但生产/工程实践优先推荐 HTTP Header，防止在日志与代理层暴露密钥）。
  - 请求头需指定：`-H "Content-Type: application/json"`。
- **一手来源**：
  - `https://aistudio.google.com/api-reference/generate-content/generate-content`
  - `https://ai.google.dev/gemini-api/docs/api-key`

### 1.2 关键参数变更与重大破坏性规则（已核实）
根据 Google 官方关于 Gemini 3.5 Flash-Lite / 3.6 Flash 的一手变更说明（`https://aistudio.google.com/docs/whats-new-gemini-3.6`）：
1. **采样参数全面弃用（Deprecation）**：
   - `temperature`、`top_p`、`top_k` 在 `gemini-3.5-flash-lite` 及 Gemini 3.6+ 中已正式弃用并被忽略；在未来模型版本中传入将直接返回 **HTTP 400 错误**。
   - **工程结论**：本项目实施直接翻译请求时，**严禁沿用旧版翻译常见的 `temperature: 0` 或 `top_p`**，请求体中必须完全剔除上述字段，改用纯粹的 `systemInstruction` 约束确定性。
2. **禁止末尾预填充（Prefilled Model Turn 校验）**：
   - 官方规定：若 `contents` 数组最后一个非空 turn 为 `role: "model"`，API 会直接拒绝并返回 **HTTP 400 Error**。
   - **工程结论**：不能使用旧技巧（如追加一条包含 `"Translation:"` 的 `model` 消息）诱导输出，所有格式与翻译约束均必须放入 `systemInstruction`。
3. **Thinking 配置与默认行为**：
   - `gemini-3.5-flash-lite` 官方默认的思维链等级为 **`minimal`**（小到几乎无额外思考，专为超高吞吐与极低时延文档/提取任务设计）。
   - Gemini 3.x 官方思维链控制参数已由 2.5 时代的 `thinkingBudget` 改为 **`thinkingLevel`**（枚举值：`MINIMAL`, `LOW`, `MEDIUM`, `HIGH`）。
   - **工程结论**：针对纯文本翻译任务，**无需显式发送 `generationConfig.thinkingConfig`**（缺省即为 `minimal`），保持最小化 Payload 即可；若用户未来要求显式配置，应使用 `thinkingConfig: { thinkingLevel: "MINIMAL" }`，不应再传旧版整数 budget。

### 1.3 最小化翻译请求 Body 结构示例（已核实）
```json
{
  "systemInstruction": {
    "parts": [
      {
        "text": "You are a professional translator. Translate the following text into the target language accurately, preserving technical terms. Output only the translation without any commentary."
      }
    ]
  },
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "原文待翻译内容..."
        }
      ]
    }
  ]
}
```

### 1.4 响应体结构与非 Thought 正文提取（已核实）
- **候选列表位置**：`response.candidates[0]`。
- **Candidate 内容结构**：
  ```json
  {
    "candidates": [
      {
        "content": {
          "role": "model",
          "parts": [
            {
              "text": "...",
              "thought": true,
              "thoughtSignature": "..."
            },
            {
              "text": "这是实际的翻译输出文本..."
            }
          ]
        },
        "finishReason": "STOP",
        "index": 0
      }
    ]
  }
  ```
- **非 Thought 文本提取算法（已核实）**：
  1. 检查 `candidates` 是否存在且长度大于 0。
  2. 获取 `candidate.content.parts` 数组。
  3. 过滤出所有 `part.thought !== true` 且包含 `text` 的 part。
  4. 将这些 part 的 `text` 按顺序拼接（`join("")`）得到最终翻译文本。
  5. 若所有 part 均被标记为 `thought: true`，说明模型未生成正常输出，需报告异常。

### 1.5 终止状态（finishReason）、阻断与错误响应（已核实）
- **`candidate.finishReason` 官方枚举**：
  - `STOP`：模型自然结束或命中停止条件（正常）。
  - `MAX_TOKENS`：达到最大 token 上限（输出被截断）。
  - `SAFETY`：因命中安全策略被阻断。
  - `RECITATION`：因涉及版权内容大段复述被阻断。
  - `BLOCKLIST`：包含黑名单词汇。
  - `PROHIBITED_CONTENT`：命中违禁内容。
  - `SPII`：敏感个人身份信息拦截。
  - `MALFORMED_FUNCTION_CALL` / `MALFORMED_RESPONSE`。
- **Prompt 级别阻断**：
  - 若整个输入 Prompt 在预审时被封锁，API 返回的 `candidates` 数组为空，此时需检查顶层 `response.promptFeedback.blockReason`（如 `SAFETY`, `BLOCKLIST`, `PROHIBITED_CONTENT`）。
- **HTTP 错误格式（4xx / 5xx）**：
  ```json
  {
    "error": {
      "code": 400,
      "message": "Invalid or deprecated parameter...",
      "status": "INVALID_ARGUMENT",
      "details": []
    }
  }
  ```

---

## 二、 OpenAI 官方 Chat Completions 规范一手核查

### 2.1 端点与请求头（已核实）
- **官方端点**：`POST https://api.openai.com/v1/chat/completions`
- **请求头**：
  - `Authorization: Bearer <OPENAI_API_KEY>`
  - `Content-Type: application/json`
- **协议约束**：仅保留标准 Chat Completions（`/v1/chat/completions`），严禁使用 `/v1/responses`（Responses API）格式。

### 2.2 请求体格式（已核实）
- `model`: 模型名称（字符串）。
- `messages`: 消息数组，标准角色支持 `system`、`developer`、`user`、`assistant`、`tool`。
  - 对翻译工具任务，推荐采用通用的 `system` 角色下发翻译 prompt，`user` 角色提交待翻译正文。
- 采样参数（在标准 OpenAI 体系中）：
  - `temperature`: 可选，浮点数。
  - `max_completion_tokens`：官方目前推荐用于替代旧的 `max_tokens`（在 o 系列及较新模型中强制使用）。

### 2.3 响应体结构与关键边界细节（已核实）
- **响应体示例**：
  ```json
  {
    "id": "chatcmpl-xxx",
    "object": "chat.completion",
    "created": 1758268864,
    "model": "gpt-4o-mini",
    "choices": [
      {
        "index": 0,
        "message": {
          "role": "assistant",
          "content": "翻译后的正文文本",
          "refusal": null
        },
        "finish_reason": "stop"
      }
    ],
    "usage": {
      "prompt_tokens": 20,
      "completion_tokens": 15,
      "total_tokens": 35
    }
  }
  ```
- **`null content` 的严格处理（已核实）**：
  - 官方规范中，`choices[0].message.content` 在以下场景下为 `null`（而非空字符串）：
    1. 当模型返回工具调用时（存在 `tool_calls` 且 `finish_reason: "tool_calls"`）。
    2. 当模型拒绝回答时（存在 `refusal`）。
  - **解析器实现规则**：必须显式防御 `message.content == null` 的情况，不能直接调用字符串方法（如 `.trim()`），否则将导致崩溃。
- **拒绝字段（`message.refusal`）（已核实）**：
  - 官方文档明确指出：`refusal` **不是** `finish_reason` 的枚举值！拒绝信息通过 `message.refusal` 字符串返回，此时 `content` 通常为 `null`。
- **`finish_reason` 枚举（已核实）**：
  - `"stop"`：模型自然结束或达到停止词。
  - `"length"`：生成达到 token 长度限制。
  - `"tool_calls"`：模型触发了工具调用。
  - `"content_filter"`：内容因安全审查被忽略/拦截。
  - `"function_call"`（旧版兼容废弃字段，被 `tool_calls` 取代）。

---

## 三、 SenseNova（商汤日日新 / SenseCore）OpenAI 兼容模式一手核查

### 3.1 原始指定文档访问状态
- 任务给定的候选文档 URL `https://platform.sensenova.cn/doc?path=/chat/QuickStart/QuickStart.md` 经实测返回 **HTTP 404 Not Found**（已废弃或重组）。
- 商汤已将“日日新大模型服务”开发者文档整合至 **SenseCore 大装置帮助中心**（`https://www.sensecore.cn/help/docs/model-as-a-service/nova/`）。

### 3.2 官方兼容 Base URL 路径（已核实）
在 SenseCore 大装置官方一手文档中，查到两种兼容模式路径：
1. **最新官方 OpenAI 模型迁移指引（2025/2026 当前页面）**：
   - 一手来源：`https://www.sensecore.cn/help/docs/model-as-a-service/nova/overview/compatible-mode`
   - 官方 SDK 配置示例明确给出：
     ```python
     client = OpenAI(
         api_key="API_KEY or API_TOKEN",
         base_url="https://api.sensenova.cn/compatible-mode/v2"
     )
     ```
   - 官方 cURL 请求示例：
     `POST https://api.sensenova.cn/compatible-mode/v2/chat/completions`
2. **深度推理帮助文档与社区历史常见路径**：
   - 一手来源：`https://www.sensecore.cn/help/docs/model-as-a-service/nova/chat/ChatCompletions/ChatDeepReasoning` 及 One-API / Cherry Studio 等开源项目：
     `https://api.sensenova.cn/compatible-mode/v1/chat/completions`
3. **架构与工程结论**：
   - 官方最新快速迁移文档标明为 **`/compatible-mode/v2`**，但部分具体接口文档仍沿用 **`/compatible-mode/v1`**。
   - **决不可硬编码！** 项目配置应支持用户自定义输入 `base_url`，UI 默认提示/占位符可提供 `https://api.sensenova.cn/compatible-mode/v2`，并允许根据用户账户实际可用情况自由调整为 `v1`。

### 3.3 鉴权方式（Bearer Key）（已核实）
- 一手来源：`https://www.sensecore.cn/help/docs/model-as-a-service/nova/overview/Authorization`
- **请求头规范**：
  ```http
  Authorization: Bearer $API_KEY
  ```
- **核心结论**：
  - 官方文档明确说明：“平台已支持 API Key 调用……在请求头里，添加 Authorization 字段：`Authorization: Bearer $API_TOKEN //$API_TOKEN 可直接用$API_KEY替换`”。
  - 过去 SenseTime 曾强制使用 AK/SK 计算 HS256 JWT Token，但目前在 ModelStudio 控制台创建的标准 API Key 可直接作为 Bearer Token 传递，无需客户端动态签发 JWT。

### 3.4 平台地域（Region）与 Token Plan（量包）核实
1. **Token Plan（Tokens 量包预付费）**：
   - 一手来源：`https://www.sensecore.cn/help/docs/model-as-a-service/nova/pricing/pricing_token_quota`
   - 事实与核查边界：已核实量包本质上是平台提供的一种“预付费优先抵扣配额”计费方式，有效期内自动扣除，耗尽后自动转按量后付费。在官方公开通用调用示例与计费文档中，未找到需要特殊 URL 或附加 Header 的证据；但这属于从公开账单与通用文档的推断，不覆盖所有账户/特定专享产品，具体须以用户具体账户开通文档为准。
2. **平台地域（Region）**：
   - 一手来源：`https://www.sensecore.cn/help/docs/support/RegionAZ`
   - 事实与核查边界：官方公开示例统一使用 `api.sensenova.cn`（或原生 `chatapi.sensenova.cn`）；文档中出现的上海等区域（`cn-sh-01`）属于底层算力/基础设施 IaaS 说明，未找到公共 SaaS 接口按地域切分子域名的公开证据。此结论同样基于公开文档推断，不排除特定私有化或专线部署差异。

---

## 四、 模型列表与模型 ID 策略核实

### 4.1 Google Gemini 模型（已核实）
- 官方确定模型 ID：**`gemini-3.5-flash-lite`**
- 输入上下文窗口：1,048,576 tokens（1M）。
- 最大输出上限：65,536 tokens（64k）。
- 默认思考模式：`minimal`。
- 一手来源：`https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite`

### 4.2 SenseNova 模型（待用户提供 / 严禁硬编码猜测）
- **核验现状**：用户在需求中明确指出“SenseNova 具体模型用户尚未给，不能硬编码猜测”。
- **官方文档示例模型**（仅供了解官方命名习惯，不作为写死凭据）：
  - 通用大模型：`SenseChat-5`（128K）、`SenseChat-Turbo`、`SenseChat`
  - 深度推理模型：`DeepSeek-R1-Distill-Qwen-14B`
  - 多模态模型：`SenseNova-V6.5-Pro`、`SenseNova-V6-Pro`
- **工程结论**：
  - 设置界面与内部配置模型 ID 必须为自由文本输入框（允许用户手动输入任意模型字符串）。
  - 不得在代码中将 SenseNova 模型写死为特定名称。

---

## 五、 核实清单汇总表

| 调查项 | 核查状态 | 一手结论与关键事实 |
| :--- | :---: | :--- |
| **Gemini 域名与端点** | **已核实** | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` |
| **Gemini 认证** | **已核实** | Header `-H "x-goog-api-key: {KEY}"` 或 Query `?key={KEY}`，优先使用 Header |
| **Gemini 3.5 采样参数** | **已核实** | `temperature`/`top_p`/`top_k` 已弃用，未来报 400，**绝不能传 `temperature: 0`** |
| **Gemini Model Prefill** | **已核实** | `contents` 末尾为 `role: "model"` 会被拦截报 400，强制指令必须走 `systemInstruction` |
| **Gemini Thinking 配置** | **已核实** | `gemini-3.5-flash-lite` 默认 Thinking 为 `minimal`；翻译请求无需发 `thinkingConfig` |
| **Gemini 非 Thought 正文提取** | **已核实** | 过滤 `candidates[0].content.parts` 中 `thought !== true` 的所有 `part.text` 并拼接 |
| **Gemini 终止与错误格式** | **已核实** | `finishReason: "STOP" / "MAX_TOKENS" / "SAFETY"` 等；错误为 `{ error: { code, message, status } }` |
| **OpenAI 端点与请求头** | **已核实** | `POST /v1/chat/completions`，`Authorization: Bearer <KEY>`，严禁使用 `/v1/responses` |
| **OpenAI `null` content** | **已核实** | 触发 `tool_calls` 或 `refusal` 时，`content` 为 `null`，解析器必须防御非字符串 |
| **OpenAI `finish_reason`** | **已核实** | `"stop"`, `"length"`, `"tool_calls"`, `"content_filter"`（`refusal` 不在 finish_reason 中） |
| **SenseNova Base URL** | **已核实** | 迁移文档推荐 `https://api.sensenova.cn/compatible-mode/v2`，另存历史 `v1`；必须可配置 |
| **SenseNova 鉴权方式** | **已核实** | `Authorization: Bearer {api-key}`，控制台 API Key 可直接代替 `$API_TOKEN` |
| **SenseNova Token Plan/地区** | **部分核实（需按账户确认）** | 已核实量包为计费方式、通用调用例使用统一域名；未见特殊URL/Header证据，不排除特定账户差异，以用户账户为准 |
| **SenseNova 具体模型** | **待用户提供** | 严禁写死，必须由用户在配置界面自由输入任意模型 ID 字符串 |

---

## 六、 对本项目的直接实现建议（只读指引）

1. **分流器精简模型**：
   - 彻底废除任何本地/历史 SDK 包装层或迁移胶水层。
   - 翻译执行器（Direct API Translator）内部仅保留两个原生 Fetcher：
     1. `GeminiNativeFetcher`：专司 `generativelanguage.googleapis.com` 的 `generateContent` 协议。
     2. `OpenAICompatibleFetcher`：专司 OpenAI 兼容规范的 `/chat/completions` 协议（覆盖标准 OpenAI 及商汤 SenseNova）。
2. **Gemini 请求构造原则**：
   - 保持 Payload 极简：仅发送 `systemInstruction`（单段指令）与 `contents`（单条 user message）。
   - **绝对不附带 `generationConfig` 中的 `temperature`、`top_p`、`top_k`**。
   - 不附带 `thinkingConfig`（依靠模型内建的 minimal 默认行为以降低时延与成本）。
3. **OpenAI 兼容请求构造原则**：
   - 请求 URL 动态计算：若配置了 `base_url`，拼接为 `${base_url.replace(/\/+$/, '')}/chat/completions`。
   - 响应内容安全提取：
     ```ts
     const choice = response.choices?.[0];
     if (!choice) throw new Error("Empty choices in completion response");
     // 截断与过滤必须先判，严禁将不完整内容作为翻译结果返回
     if (choice.finish_reason === "length") {
       throw new Error("Translation output was truncated due to token limit");
     }
     if (choice.finish_reason === "content_filter") {
       throw new Error("Translation output was omitted due to content filter");
     }
     if (choice.message?.refusal) {
       // 固定脱敏错误，严禁拼接 raw refusal，防止泄漏原文或私密内容
       throw new Error("Translation request was refused by model policy");
     }
     if (choice.finish_reason === "stop" && choice.message?.content != null) {
       return choice.message.content;
     }
     throw new Error("No complete textual content returned from completion response");
     ```
4. **配置项设计**：
   - Provider 类型选择：`"gemini"` 或 `"openai-compatible"`。
   - 模型名称（`model`）：纯文本输入，SenseNova 与 Gemini 均可自由输入。
   - 基础 URL（`base_url`）：OpenAI 兼容模式下必填/可选填，SenseNova 场景建议占位符提示 `https://api.sensenova.cn/compatible-mode/v2`。
   - API 密钥（`apiKey`）：密码输入框，Gemini 映射为 `x-goog-api-key`，OpenAI 映射为 `Bearer`。
