Paseo Reasoning Translator 通过 Google Gemini 原生 generateContent 或 OpenAI 兼容 Chat Completions HTTP 接口，直接翻译 Paseo 公开显示的 agent 思考过程。

流式生成期间，时间线显示带宿主节奏的原文。默认采用手动模式：思考块完成后点击「翻译」，仅提交该块；打开会话和加载历史不会自动排队。可选的自动模式会提交已完成的新思考块和已加载的历史记录。译文在原位显示，保留原文与译文切换以及折叠功能；进度查询失败时，点击「继续查询」可恢复同一任务，而不是重新发送模型请求。

插件需要 Paseo daemon 和客户端 0.15.0 或更高版本。翻译默认关闭。从侧边栏或命令中心打开设置，保存连接后再开启。默认格式为 Gemini，Base URL 为 https://generativelanguage.googleapis.com/v1beta，模型为 gemini-3.5-flash-lite。OpenAI 兼容服务需填写 Base URL 和准确模型 ID；SenseNova 可使用 https://api.sensenova.cn/compatible-mode/v2，模型 ID 需从你的账户确认。

设置与限制：
- 支持多连接预设：每个预设独立保存名称、格式、Base URL、模型和 API key，下拉切换互不覆盖（自动兼容读取旧版单连接文件）。保存不发送测试请求，可点击「测试连接」验证。更改格式或地址后必须重新输入新 key，但输入过程中切换格式或修改地址不会清空当前已填入的 key。
- Key 保存在 daemon 的 PASEO_HOME/plugin-data/paseo-reasoning-translator/connection.json；未指定 PASEO_HOME 时使用 ~/.paseo 下对应路径。插件会尽力限制目录与文件权限。该文件是未加密的本机文件，不是系统密码库。元数据不会返回 key，保存成功后会清空输入框。
- 目标语言可自定义，默认简体中文。每块原文上限 200,000 字符；超过 12,000 字符时按段落拆分并依次翻译。
- HTTP 并发为 1，等待队列上限 64 项，内存结果缓存上限 128 条、30 分钟过期。每个请求连同响应读取限时 120 秒，响应体上限 2,000,000 字节。失败、拒绝和截断会在行内明确显示，从不自动重发。
- 连接、模型、key 或普通设置变化会取消旧任务并撤销旧译文。手动点击绑定 host、agent、准确原文以及 settingsRevision 和 connectionRevision。客户端约每 5 秒刷新无 key 元数据，daemon 也会拒绝过期提交。

插件仅把公开 reasoning 和目标语言发送给所选 API，不创建 Paseo agent 或 workspace，不使用工具或 MCP。翻译消耗 API 账户额度，提供商可能按其条款留存请求文本。插件结果缓存仅在内存中，不把原始响应体、正文或凭据写入插件日志。只允许 HTTPS，本机 loopback 接口可使用 HTTP。
