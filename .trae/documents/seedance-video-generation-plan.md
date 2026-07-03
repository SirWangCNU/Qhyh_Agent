# Seedance 视频生成画布接入计划

## 1. 摘要

在已有后端 `src/video_generation.py`（doubao-seedance 异步提交 + 轮询 + 下载）和画布视频模型列表接口的基础上，补齐前端画布生成链路：

1. 放开 `useCanvasGenerate.ts` 对 `mode === "video"` 的硬拦截；
2. 正确向前端传 `mode` 与视频参数（`resolution/ratio/duration/generate_audio/watermark`）；
3. 视频生成成功后自动创建 `video` 结果节点并连线；
4. 补齐 `GenerateNodeData` 类型与属性面板对视频结果节点的支持；
5. 在 `.env` 中显式声明两个 Seedance 模型，方便mock/真机测试。

## 2. 当前状态分析

| 层级 | 已实现 | 缺失 / 问题 |
|------|--------|-------------|
| 后端 `src/video_generation.py` | `VideoGenerationRequest`、`submit_video_generation`、`poll_video_task`、下载落盘 | — |
| 后端 `src/canvas/service.py:run_generate_video` | 接收 `mode=video`，按 `params.resolution/ratio/duration/generate_audio/watermark` 调生成 | — |
| 后端 `src/main.py` | `POST /api/videos/generate`、`GET /api/videos/models` | — |
| 后端 `src/canvas/router.py` | `POST /api/canvas/projects/{id}/generate`、`GET /api/canvas/video-models` | — |
| 前端 `use-media.ts` | `useGenerateVideo` | — |
| 前端 `use-canvas.ts` | `useCanvasGenerateMutation`、`GenerateRequestInput` 已含 `mode` 字段 | — |
| 前端 `components/canvas/types.ts` | `VideoNodeData`、`GenerateMode`、`VIDEO_*_OPTIONS` | `GenerateNodeData` 未声明 `ratio/duration/generate_audio/watermark`，多处用 `as unknown as Record` 绕过 |
| 前端 `components/canvas/nodeFactory.ts` | `makeVideoNode` 已写好 | — |
| 前端 `components/canvas/nodes/VideoNode.tsx` | 播放器、下载、打开 | — |
| 前端 `components/canvas/nodes/GenerateNode.tsx` | 视频参数 UI 已存在 | 切换 mode 时未重置 size/model；`as unknown as Record` 类型绕过 |
| 前端 `components/canvas/panels/NodeInspector.tsx` | 生成节点视频参数 UI 已存在 | 无 `kind === "video"` 编辑器；`as unknown as Record` 类型绕过 |
| 前端 `components/canvas/hooks/useCanvasGenerate.ts` | 图片结果节点创建已通 | **硬拦截视频**；未传 `mode`；`params` 只传 `size/model`；未处理 `result_video_url` |
| 配置 `.env` | 图片模型已配置 | 缺少视频模型配置块 |

关键阻塞点：`useCanvasGenerate.ts` 第 54–60 行直接返回 `视频生成暂未接入`。

## 3. 拟变更清单

### 3.1 前端类型补齐：`frontend/src/components/canvas/types.ts`

- 在 `GenerateNodeData` 中正式声明视频参数字段：

```ts
export interface GenerateNodeData {
  kind: "generate";
  status: GenerateStatus;
  mode: GenerateMode;
  size: string;                 // image=1024x1024..., video=720p/1080p
  model: string;
  prompt: string;
  negative_prompt: string;
  error?: string;
  // 视频专属
  ratio?: string;
  duration?: number;
  generate_audio?: boolean;
  watermark?: boolean;
}
```

- 保留 `[key: string]: unknown`（react-flow `Node<T>` 要求 `T` 可扩展为 `Record<string, unknown>`，且节点内 `data as GenerateNodeData` 强转需要重叠）。

### 3.2 生成节点默认数据：`frontend/src/components/canvas/nodeFactory.ts`

- `defaultNodeData("generate")` 保持 `mode: "image"` 默认不变；
- 在 `GenerateNode.tsx` / `NodeInspector.tsx` 的 mode `onValueChange` 里，切换 mode 时同步修正 `size` 与 `model`：
  - `image` → `size: "1024x1024"`, `model: FALLBACK_MODEL`；
  - `video` → `size: "720p"`, `model: FALLBACK_VIDEO_MODEL`。

### 3.3 生成编排 hook：`frontend/src/components/canvas/hooks/useCanvasGenerate.ts`

1. 删除 `if (genData.mode === "video")` early return。
2. 请求体显式加入 `mode: genData.mode`。
3. 按 `mode` 组装 `params`：
   - `image`：`{ model, size }`。
   - `video`：`{ model, resolution: genData.size, ratio, duration, generate_audio, watermark }`。
4. 成功后分两种结果节点：
   - `result_image_url` → `makeImageNode`；
   - `result_video_url` → `makeVideoNode`。
5. 新增 `nextVideoIndex()`，逻辑与 `nextImageIndex()` 一致但统计 `kind === "video"`。
6. 错误处理统一进入 `status="error"`。

### 3.4 生成节点 UI：`frontend/src/components/canvas/nodes/GenerateNode.tsx`

- 用补齐后的 `GenerateNodeData` 类型替换 `as unknown as Record<string, ...>` 强制转换。
- mode `Select` 切换时同时更新 `size` 与 `model` 默认值。
- 视频参数编辑器保持原 UI。

### 3.5 属性面板：`frontend/src/components/canvas/panels/NodeInspector.tsx`

- `GenerateEditor`：
  - 用补齐后的 `GenerateNodeData` 类型替换强制转换。
  - mode 切换时同步修正 `size/model`。
- 新增 `VideoEditor` 组件（参考 `ImageEditor`）：
  - 显示 `<video>` 播放器；
  - 显示中文序号标签；
  - 提供「下载」「打开」按钮。
- 在 `NodeInspector` 主分支中增加 `kind === "video"` 路由。

### 3.6 环境配置：`qinghe-video/.env`

在图片配置后追加视频配置块（与 `src/config.py` 默认值对齐）：

```env
# ---------- 视频生成配置（doubao-seedance） ----------
VIDEO_API_BASE_URL=https://agaigw.com
VIDEO_API_KEY=                       # 为空时复用 AIAPIAL_API_KEY
VIDEO_MODEL=doubao-seedance-2-0-260128
VIDEO_SIZE=720p
VIDEO_RESPONSE_FORMAT=url
VIDEO_MODEL_OPTIONS=doubao-seedance-2-0-260128,doubao-seedance-2-0-fast-260128
```

> 说明：`VIDEO_API_KEY` 留空即可复用已有的 `AIAPIAL_API_KEY`；显式列出 `VIDEO_MODEL_OPTIONS` 让前端下拉框可直接读取 `.env` 中的两个模型。

### 3.7 后端 mock 测试验证

- 复用已有 `tests/test_video_generation.py` 验证 `submit/query/poll/download` 全链路；
- 可选新增一个画布视频分支单元测试：`tests/test_canvas_video.py`，mock `src.canvas.service.generate_video`，验证 `run_generate_video` 能正确解析 `params` 并返回 `result_video_url`。

## 4. 关键决策与假设

1. **`size` 字段复用**：生成节点仍用 `size` 字段保存视频分辨率；发送到后端时映射为 `params.resolution`，避免新增字段导致旧数据不兼容。
2. **视频参考图**：仅使用 `ref_type === "content"` 的参考图作为 Seedance 的 `reference_images`；其余 `style/structure/pose` 仍保留用于图片生成，不混入视频请求。
3. **音频与水印默认值**：与官方示例一致，`generate_audio=true`、`watermark=false`。
4. **结果节点序号**：图片与视频分别计数（`nextImageIndex` / `nextVideoIndex`），避免两类节点序号互相干扰。
5. **不修改后端 video_generation 核心逻辑**：当前后端已能按官方请求体参数工作，仅补齐前端传参与配置。

## 5. 验证步骤

1. **类型检查**：在 `qinghe-video/frontend` 执行 `npx tsc --noEmit`，确认无 TS 错误。
2. **后端单元测试**：在 `qinghe-video` 执行 `pytest tests/test_video_generation.py -v`；如新增画布视频测试，一并执行。
3. **API mock 测试**：
   - 启动后端；
   - 使用 Postman/curl 调 `POST /api/videos/generate`，payload 使用示例中的 mock 参数（prompt + 参考图 + resolution/ratio/duration/generate_audio/watermark），确认返回 `task_id` 与最终 `video_url`。
4. **前端联调**：
   - 打开无限画布，创建生成节点；
   - 切换 mode 为「生视频」，确认模型下拉出现 `doubao-seedance-2-0-260128` / `doubao-seedance-2-0-fast-260128`；
   - 设置参数并接入参考图，点击生成；
   - 等待轮询完成后画布右侧出现可播放的视频结果节点，并自动连线。
5. **资产检查**：确认生成的视频已写入 `outputs/video/` 并在「我的资产」中以 `source=canvas`、`media_type=video` 展示。
