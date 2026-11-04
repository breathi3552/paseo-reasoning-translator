# 当前实现计划：直接 HTTP 思考翻译

## 范围

仅保留两种请求格式：Google Gemini 原生 generateContent、OpenAI 兼容 Chat Completions。原型期直接替换旧执行链路，不维护 agent worker、Paseo 预设后端或历史迁移路径。

默认关闭翻译，翻译方式默认手动点击。可切换自动模式。保留原位回显、原译文切换、折叠和流式原文。

## 模块与责任

### 私有连接

`server/connection.ts` 负责一个完整连接的校验、服务端读取、无 key 元数据、原子保存和变更通知。

- 路径：daemon 的 PASEO_HOME/plugin-data/paseo-think-what/connection.json；缺省 home 为 ~/.paseo。
- 只在用户保存时创建文件。目录 0700、文件 0600 尽力设置；非加密，非 OS vault。
- 保存使用 expectedRevision；同一模块内串行提交，冲突可见，不部分更新。
- Key 操作为保留、替换、删除。更改格式或 Base URL 时不得自动携带原 key。
- 普通 settings 仅含 enabled、translationMode、targetLanguage。

### HTTP 执行

`server/http-translator.ts` 接收私有连接与源文本，使用可注入的 Node fetch。

- Gemini 默认 gemini-3.5-flash-lite，x-goog-api-key header，systemInstruction + user contents。
- OpenAI 使用 Bearer key，追加 /chat/completions，仅发送 model + system/user messages + stream:false。
- 保留 Base URL 版本路径；仅允许 HTTPS/loopback HTTP，拒绝 URL userinfo/query/hash 和 Gemini 模型路径穿透。
- redirect:error，单次调用，不自动重试；deadline/AbortSignal 同时约束 fetch 和读取响应体。
- 只取最终可见文本；拒绝空内容、拒绝/拦截、截断、工具调用和异常响应。Gemini thought 与 OpenAI reasoning 不作为译文。
- 原始 provider 错误、响应体、key 和源正文不进入错误输出或日志。

### 任务生命周期

`server/translation-service.ts` 保留并发 1、等待队列 64、内存缓存 128/TTL 30 分钟和段落分块。

- 提交必须携带 settings revision 和 connection revision。
- 配置订阅触发 generation 变化，取消旧 HTTP、撤销排队任务及已完成结果。
- 每块发出前及返回后重新授权，避免异步读取与变更之间的竞态。
- Job 不持有凭据或 Paseo 句柄，缓存身份只使用配置 revision 等非敏感身份信息。
- 清空缓存或 close 不会自动重发请求。失败任务仅由明确的 retry 再提交。

### 客户端

`client/connection.ts` 共享每 host 的无 key 元数据查询，约 5 秒刷新；查询元数据不会发送模型请求。

`client/settings.tsx` 沿用 RN、theme 和 compact 控件，配置接口格式、Base URL、模型 ID 和 masked key。保存成功清空 key 输入；失败保留编辑状态，可显式重新加载处理冲突。

`client/timeline.tsx` / `shared/translation-query.ts` 将两种 revision 纳入准确原文身份。流式追加不改变挂载身份；未点击不提交，提交中禁止重复点击，进度查询失败恢复同一 job。配置变化后不显示旧配置缓存译文。

## 离线验证

- 私有连接默认值、无初始化写入、权限、原子保存、并发 revision 冲突、key 保留/删除/目标变更规则。
- 两种 HTTP 请求的 URL/header/body、准确 Gemini 模型和最终文本适配；不发送弃用或 provider 私有参数。
- Loopback HTTP server 验证真实 Node fetch；其他请求用注入 fetch，无公网模型调用。
- 拒绝/截断/工具/非 JSON/大小上限与脱敏错误；失败无自动重发。
- 不协作的 fetch/body 在 timeout/cancel/close 时有界，后续队列仍可继续。
- 连接与 settings 变更撤销授权、取消旧 HTTP、丢弃晚到输出；手动意图与缓存不跨配置。
- 实际 timeline TSX 点击 → HTTP adapter → TranslationService → poll → ready Markdown / 原文切换闭环。
- 类型检查、全量测试、RN DOM 扫描、changed UI detector。

## 人工验收

主代理审查后部署。由用户填写真实 key；SenseNova 模型 ID 尚待用户提供。验证两个接口、手动模式历史零排队、自动模式、错误重试、换连接撤销、宽/窄布局与真实流式节奏。实施阶段不写真实配置、不重载、不请求公网模型。
