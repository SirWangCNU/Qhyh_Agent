# Debug Session: canvas-two-refs-disconnect

## Status
[OPEN]

## Symptom
无限画布中，当生成节点连接两张参考图（content 类型）+ 一个提示词节点后，点击「生成」按钮，前端显示错误：

> Server disconnected without sending a response.

单张参考图时是否成功待确认。

## Environment
- OS: Windows 11
- Browser: (待用户补充)
- Backend: FastAPI + uvicorn (port 18739)
- Image gen: doubao-seedream via OpenAI-compatible gateway
- Target size: 1920x1920

## Reproduction Steps
1. 进入 `/#/canvas`
2. 新建画布
3. 拖拽两个「参考图」节点并上传图片（保持默认 content 类型）
4. 拖拽一个「提示词」节点并输入文字
5. 从两个参考图 + 提示词节点分别拉线到「生成」节点
6. 生成节点选择「生图片」+ 尺寸 1920x1920
7. 点击「生成」
8. 观察到「失败：Server disconnected without sending a response."

## Hypotheses
1. **H1 - Uvicorn/Proxy Timeout**: 后端生成大图（1920x1920）耗时超过 60s，uvicorn 或前置代理在响应返回前断开连接。
2. **H2 - Base64 Payload Too Large**: 两张参考图中有一张或两张被传入 payload（实际逻辑只传第一张，但需确认），base64 编码后请求体过大，导致网关/服务器断开连接。
3. **H3 - Image Resolution Constraint**: doubao-seedream 对 1920x1920 或图生图组合不支持，返回错误但 FastAPI 异常处理导致连接断开而非返回 500。
4. **H4 - Reference Image Resolve Failure**: `_resolve_output_image` 在两张图时解析失败（如找不到文件、rglob 慢、MIME 不支持），异常未正确捕获导致连接断开。
5. **H5 - Missing Negative Prompt / Schema Change**: 前端 recent 移除了 negative_prompt 字段，但某些路径仍可能发送或后端期望该字段，请求体 schema 不匹配导致网关断开。

## Instrumentation Plan
- 在 `src/canvas/router.py::generate_node_api` 入口/出口打 log
- 在 `src/canvas/service.py::run_generate` 入口/关键步骤打 log
- 在 `src/image_generation.py::generate_with_references` 入口/参考图解析/payload 大小/API 调用耗时打 log
- 不修改业务逻辑，仅添加日志上报

## Evidence Log

### 2026-06-29：用户复现并产生日志

两次生成均成功（无断连），说明之前的 "Server disconnected" 可能与当时网络/超时有关，当前 API 调用正常：

- `project_id`: `bc6d755407464981a67a946e412bacf0`
- `node_id`: `4d916621-1214-44f2-b6e9-5f2524dd8e38`
- 请求参数：`references_count=2`，两张均为 `content` 类型
- 主参考图：`/outputs/upload/upload_1782718233523.jpg`（人物图）
- API 响应：耗时约 27-30 秒，返回 `data_count=1`
- 生成成功但结果人物与参考图不一致

### 关键发现

1. **断连问题已消失**：两次请求都完整返回 200，`elapsed_sec` 约 27-30 秒。
2. **多参考图降级策略导致第二张图被浪费**：
   - 后端 `generate_with_references` 只把 `content_refs[0]` 作为 `image` 传给 seedream
   - `content_refs[1]`（咖啡机图）此前完全没有被利用（既没传图，也没注入 prompt）
   - 这是结果中咖啡机/人物表现不符合预期的根因
3. **模型能力限制**：即使人物图作为主参考图传入，seedream 也不能保证 100% 人物一致性；真正同时保持多图特征需要模型原生支持多图参考。

## Fix

### 已实施
1. **短期缓解**：在 `src/image_generation.py::generate_with_references` 中，当存在多张 `content` 参考图时，把其余 content 参考图的信息注入 prompt。
2. **多图参考数组**：按用户提供的 seedream 示例格式，把全部 `content_refs` 转成 base64 字符串数组，通过 `image` 字段传给 Seedream：
   - 单张：`"image": "base64..."`
   - 多张：`"image": ["base64...", "base64..."]`
3. **Prompt 标记**：自动在 prompt 中追加 `@图1`、`@图2` 等引用说明，帮助模型对齐 image 数组中的参考图。

### 待验证
- Seedream 网关 `agaigw.com` 是否真正接受 `image` 为 base64 数组
- 多张参考图后人物一致性和物体一致性是否改善

### 未实施（备选方案）
- **LLM 视觉反推**：让 LLM 描述非主参考图内容，生成更详细的文字 prompt（需要 LLM 视觉能力）
- **用户指定主参考图**：让前端可以选择哪张图是主参考图

## Verification
- 代码语法检查通过
- 需要用户重启后端后再次用两张 content 参考图生成，观察人物/物体一致性是否改善
