# 青禾映画 · 接入真实 AI 能力规划

## 现状总结

| 组件 | 状态 |
|------|------|
| `src/image_generation.py` | **已实现** — `doubao-seedream` via `agaigw.com`，async httpx |
| `src/video_generation.py` | **Stub** — `build_video_preview()` 仅返回占位配置 |
| `src/main.py` `/api/images/generate` | **已实现** — 独立端点，前端手动调用 |
| 前端 `result.js` | **已实现** — 手动"生成分镜图片"按钮，`Promise.all` 并发 4 张 |
| LangGraph 流水线 | **未集成** — 图片生成不在流水线中，需手动触发 |
| 视频生成 API | `doubao-seedance` 模型已在 `.env` 配置，但无调用代码 |

**核心差距**：图片/视频生成是"流水线外的手动操作"，不是"自动产出"。

---

## 目标架构

```
planner → copywriter → scriptwriter → visual_designer
    → image_generator → video_generator
    → distributor → report_generator
```

新增两个**独立节点**（不混入 visual_designer）：
- `image_generator`：调用已有的 `generate_image()`，并发生成分镜图
- `video_generator`：调用新实现的 `generate_video()`，以图生视频

---

## Phase 1：图片生成接入流水线（核心）

### 1.1 新建 `src/nodes/image_generator.py`

```python
# 逻辑：
# 1. 从 state["visual_output"]["shot_prompts"] 取 prompt 列表
# 2. 用 ThreadPoolExecutor 并发调用同步版 generate_image（LangGraph 节点是同步函数）
# 3. 将结果写入 state["generated_images"]
# 4. 单张失败记录 error 但不中断其他镜头
```

需要在 `src/image_generation.py` 新增同步版本：
```python
def generate_image_sync(request: ImageGenerationRequest) -> list[ImageGenerationResult]:
    """同步版本，供 LangGraph 节点调用。"""
    # 用 httpx.Client 替代 AsyncClient
```

### 1.2 修改 `src/state.py`

```python
generated_images: list[dict]    # [{shot_id, url, revised_prompt, error}]
generated_videos: list[dict]    # Phase 2 用
```

### 1.3 修改 `src/models.py`

```python
class GeneratedImage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    shot_id: int
    url: str | None = None
    revised_prompt: str | None = None
    error: str | None = None
```

### 1.4 修改 `src/graph.py`

```python
IMAGE_GENERATOR = "image_generator"
graph.add_node(IMAGE_GENERATOR, image_generator_node)

# visual_designer → image_generator → distributor
graph.add_conditional_edges(VISUAL_DESIGNER, _route_after_node,
    {"continue": IMAGE_GENERATOR, REPORT_GENERATOR: REPORT_GENERATOR})
graph.add_conditional_edges(IMAGE_GENERATOR, _route_after_node,
    {"continue": DISTRIBUTOR, REPORT_GENERATOR: REPORT_GENERATOR})
```

### 1.5 修改 `src/agent_steps.py`

注册新步骤：`AgentStep` Literal 类型、`STEP_NODE`、`STEP_OUTPUT_KEY`、`STEP_LABEL`。

### 1.6 修改 `src/config.py`

```python
IMAGE_CONCURRENCY: int = 2        # 并发生图数（防限流）
IMAGE_TIMEOUT: int = 180          # 单图超时秒数
IMAGE_GENERATION_ENABLED: bool = True  # 开关
MAX_SHOTS_FOR_GENERATION: int = 4 # 限制实际生成的镜头数
```

### 1.7 修改 `src/main.py`

在 `/api/generate` 和 `/api/generate/stream` 返回的 `final_result` 中加入 `generated_images`。

### 1.8 修改 `src/nodes/report_generator.py`

报告新增"AI 生成素材"章节，展示图片 URL 和生成状态。

### 1.9 修改前端

- `pipeline.js`：NODES 数组插入 `image_generator`（标签"生图"，图标 `palette` 或 `image`）
- `result.js`：
  - 流水线完成后自动展示已生成的图片（从 `final_result.generated_images` 读取）
  - 保留手动"重新生成"按钮
  - 图片画廊：每个镜头卡片 = 图片 + prompt + 原图链接

---

## Phase 2：视频生成接入

### 2.1 实现 `src/video_generation.py`

替换 stub：
```python
async def generate_video(request: VideoGenerationRequest) -> VideoGenerationResult:
    # 1. POST /v1/video/generations 提交任务
    # 2. 轮询任务状态（间隔 5s，最多 300s）
    # 3. 返回 video_url
```

**需确认**：`agaigw.com` 的视频生成 API 格式（`doubao-seedance` 模型）。
- 如果是 OpenAI 兼容格式 → 直接调用
- 如果是自定义格式 → 需要逆向或查文档

### 2.2 新建 `src/nodes/video_generator.py`

```python
# 1. 从 state["generated_images"] 取成功生成的图片
# 2. 每个镜头调用视频生成（以图片为首帧 + prompt）
# 3. 写入 state["generated_videos"]
```

### 2.3 修改 graph/state/config/agent_steps

注册 `video_generator` 节点，插入到 `image_generator` 之后。

### 2.4 前端视频展示

结果页增加视频画廊（HTML5 `<video>` 标签），展示生成的视频片段。

---

## Phase 3：优化与稳定

| 项目 | 说明 |
|------|------|
| 成本控制 | `MAX_SHOTS_FOR_GENERATION=4`，前端显示预估费用 |
| 重试降级 | 单张图失败重试 1 次 → 跳过；视频超时降级为"预览配置" |
| SSE 进度细化 | 图片/视频生成阶段发送实时进度事件 |
| 前端状态持久化 | 修复已知 Bug（AGENTS.md 中记录的 sessionStorage 方案） |
| URL 持久化 | doubao-seedream URL 可能 24h 过期，需 OSS 或本地落盘 |

---

## 文件变更清单

| 文件 | 变更 | Phase |
|------|------|-------|
| `src/nodes/image_generator.py` | **新建** | 1 |
| `src/image_generation.py` | 新增 `generate_image_sync()` | 1 |
| `src/state.py` | 新增 `generated_images`, `generated_videos` | 1 |
| `src/models.py` | 新增 `GeneratedImage`, `GeneratedVideo` | 1 |
| `src/config.py` | 新增生成配置项 | 1 |
| `src/graph.py` | 注册新节点和边 | 1 |
| `src/agent_steps.py` | 注册新步骤 | 1 |
| `src/main.py` | 返回结果包含生成资产 | 1 |
| `src/nodes/report_generator.py` | 报告展示生成素材 | 1 |
| `frontend/assets/js/pipeline.js` | 新增节点 UI | 1 |
| `frontend/assets/js/result.js` | 自动展示图片画廊 | 1 |
| `frontend/assets/css/style.css` | 图片/视频卡片样式 | 1 |
| `src/video_generation.py` | 替换 stub 为真实实现 | 2 |
| `src/nodes/video_generator.py` | **新建** | 2 |
| `frontend/index.html` | 新增视频画廊容器 | 2 |
| `tests/test_graph.py` | 测试新节点注册 | 1 |
| `.env.example` | 文档化新配置项 | 1 |

---

## 验证方式

1. `pytest tests/ -v` — 确认新节点注册、模型校验通过
2. 启动后端 `uvicorn src.main:app --reload`，调用 `POST /api/generate` 确认：
   - 流水线经过 `image_generator` 节点
   - 返回 `generated_images` 字段包含图片 URL
   - 报告中包含"AI 生成素材"章节
3. 前端打开 `/`，生成方案后确认图片画廊自动展示
4. 测试错误场景：断网 / API Key 无效 / 单张图超时

---

## 关键风险

| 风险 | 缓解 |
|------|------|
| `agaigw.com` 视频 API 格式不明 | 先 HTTP 试探 + 逆向；或切换到 Kling/Runway |
| 图片 URL 24h 过期 | Phase 3 加 OSS 持久化；MVP 提示用户及时下载 |
| 并发 4 张图被限流 | `IMAGE_CONCURRENCY=2`，加退避重试 |
| 视频生成耗时 2+ 分钟 | SSE 推送实时进度；前端显示预估时间 |
