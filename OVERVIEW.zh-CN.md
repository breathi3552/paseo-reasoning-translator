Paseo think what 通过 Google Gemini 原生 generateContent 或 OpenAI 兼容 Chat Completions HTTP 接口，直接翻译 Paseo 公开显示的 agent 思考过程。

流式生成期间显示带宿主节奏的原文。默认手动模式：思考块完成后点击「翻译」，仅提交该块；打开会话和加载历史不会自动排队。可选自动模式会提交已完成的新思考和已加载历史。译文在原位显示，保留原译文切换和折叠；进度查询失败时恢复同一任务，而不是重新发送模型请求。

需要 Paseo daemon 和客户端 0.15.0 或更高版本。翻译默认关闭。从侧边栏或命令中心打开设置，保存连接后再开启。默认格式为 Gemini，Base URL 为 https://generativelanguage.googleapis.com/v1beta，模型为 gemini-3.5-flash-lite。OpenAI 兼容服务需自由填写 Base URL 和准确模型 ID；SenseNova 可使用 https://api.sensenova.cn/compatible-mode/v2，模型 ID 由用户从账户确认。

设置与限制：
- 仅管理一个当前连接：格式、Base URL、模型和 API key。保存不发送测试请求。更改格式或地址必须重新输入或删除 key；同目标只改模型可保留 key。
- Key 保存在 daemon 的 PASEO_HOME/plugin-data/paseo-think-what/connection.json；未指定 PASEO_HOME 时使用 ~/.paseo 下对应路径。尽力限制目录与文件权限。这是未加密的本机文件，不是系统密码库。元数据不会返回 key，保存成功清空输入。
- 目标语言可自定义，默认简体中文。每块原文最多 200,000 字符；长文本以 12,000 字符为分块上限，按段落拆分后依次翻译。
- HTTP 并发为 1，等待队列最多 64 项，内存结果缓存最多 128 条、30 分钟过期。每个请求连同响应读取限时 120 秒，响应体最多 2,000,000 字节。失败、拒绝和截断明确显示，不自动重发。
- 连接、模型、key 或普通设置变化会取消旧任务、撤销旧译文。手动点击绑定 host、agent、准确原文和配置 revision。客户端约每 5 秒刷新无 key 元数据；daemon 也会拒绝过期提交。

插件仅把公开 reasoning 和目标语言发送给所选 API，不创建 Paseo agent 或 workspace，不使用工具或 MCP。翻译消耗 API 账户额度，提供商可能按其条款留存请求文本。插件结果缓存仅在内存中，不把原始响应体、正文或凭据写入插件日志。只允许 HTTPS，loopback 接口可使用 HTTP。
