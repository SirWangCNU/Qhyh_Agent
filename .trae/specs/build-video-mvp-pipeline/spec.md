# 农业广告视频 MVP 流水线 Spec

## Why

当前 `qinghe-video` 项目只产出文本方案 + 图片，没有真正的视频成片能力。`src/video_generation.py` 是 stub（仅返回配置卡片），无 TTS、无视频合成依赖。需要在现有 6 Agent + seedream 生图基础上，以最小增量接入 TTS 与视频合成，让用户能拿到一条可播放、可下载的 9:16 农业广告短视频。同时前端工坊的 Agent 输出展示不够清晰，图片生成流程需要更完善。

## What Changes

- 新增 TTS 服务（edge-tts，免费无 Key），把文案 Agent 的口播文案合成 mp3
- 新增视频合成服务（moviepy + Pillow），把分镜图片轮播 + 旁白音频拼接为 9:16 mp4
- 新增一键成片端点 `POST /api/video/mvp`，串联：分镜取图 → TTS → moviepy 合成
- 前端工坊新增「一键成片」按钮与 `<video>` 播放/下载区
- 前端重构每个 Agent 步骤的输出展示：按输出模型字段结构化渲染，不再只塞 JSON
- 前端图片生成流程完善：支持选择分镜、单张重生、加载状态、失败重试
- 前端视觉风格优化：保持农业编辑式有机风，强化 Agent 产物的可读性
- 新增依赖：edge-tts、moviepy、Pillow
- 配置项：TTS_VOICE、VIDEO_FPS、VIDEO_RESOLUTION

## Impact

- Affected code:
  - `qinghe-video/src/tts_service.py`（新增）
  - `qinghe-video/src/video_compose.py`（新增）
  - `qinghe-video/src/main.py`（新增端点）
  - `qinghe-video/src/config.py`（新增配置）
  - `qinghe-video/pyproject.toml`（新增依赖）
  - `qinghe-video/frontend/index.html`（成片区 + Agent 输出区重构）
  - `qinghe-video/frontend/assets/js/workshop.js`（Agent 输出结构化渲染 + 成片流程）
  - `qinghe-video/frontend/assets/js/result.js`（图片生成流程完善）
  - `qinghe-video/frontend/assets/css/style.css`（Agent 输出卡片样式 + 成片区样式）
- 不涉及数据库、Redis、鉴权，保持单进程内存态

## ADDED Requirements

### Requirement: TTS 旁白合成
系统 SHALL 提供 TTS 服务，将文案 Agent 产出的口播文案合成为 mp3 音频文件。

#### Scenario: 正常合成
- **WHEN** 调用 `POST /api/tts/generate`，传入文本内容
- **THEN** 返回 mp3 文件路径，文件可被视频合成服务使用

#### Scenario: 文本为空
- **WHEN** 传入空文本
- **THEN** 返回 400 错误，提示「文本不能为空」

### Requirement: 视频合成
系统 SHALL 提供视频合成服务，将分镜图片按设定时长轮播并叠加 TTS 音频，输出 9:16 竖屏 mp4。

#### Scenario: 正常合成
- **WHEN** 调用 `POST /api/video/compose`，传入图片路径列表与音频路径
- **THEN** 返回 mp4 文件路径，分辨率 1080×1920，含旁白音频

#### Scenario: 图片不足
- **WHEN** 传入图片少于 1 张
- **THEN** 返回 400 错误，提示「至少需要 1 张图片」

### Requirement: 一键成片端点
系统 SHALL 提供一键成片端点，串联分镜取图 → TTS → 视频合成全流程。

#### Scenario: 正常成片
- **WHEN** 调用 `POST /api/video/mvp`，传入完整 workshop state
- **THEN** 依次执行生图、TTS、合成，返回 mp4 下载 URL

### Requirement: Agent 输出结构化展示
前端 SHALL 按 Agent 输出模型的字段结构化渲染产物，而非整体 JSON 塞入。

#### Scenario: 策划 Agent 输出
- **WHEN** 策划 Agent 执行完成
- **THEN** 前端分字段展示：主题、核心卖点（列表）、目标受众（年龄/地区/画像）、情感基调、创意角度、视频类型、策略备注

#### Scenario: 文案 Agent 输出
- **WHEN** 文案 Agent 执行完成
- **THEN** 前端分字段展示：Hook、口播正文、CTA，口播正文高亮可复制

### Requirement: 图片生成流程完善
前端 SHALL 支持分镜图片的逐张生成、单张重生、加载状态与失败重试。

#### Scenario: 逐张生成
- **WHEN** 点击「生成图片素材」
- **THEN** 每张分镜图独立请求，独立展示加载态，成功后填入卡片

#### Scenario: 单张重生
- **WHEN** 点击某张已生成图片的「重生」按钮
- **THEN** 仅重新生成该张图片，不影响其他张

### Requirement: 前端成片播放与下载
前端 SHALL 在成片完成后内嵌 `<video>` 播放器并提供下载按钮。

#### Scenario: 成片完成
- **WHEN** 一键成片流程返回 mp4 URL
- **THEN** 显示视频播放器与「下载成片」按钮

## MODIFIED Requirements

### Requirement: 视频生成端点
原有 `src/video_generation.py` 的 `POST /api/videos/generate` 返回 stub 预览。修改为：保留预览端点用于配置展示，新增 `POST /api/video/compose` 与 `POST /api/video/mvp` 产出真实 mp4。

### Requirement: 工坊素材区
原有素材区仅支持「生成图片素材」与「生成视频展示」两个按钮。修改为：图片区支持逐张生成与单张重生，新增「一键成片」按钮触发完整视频流程，新增视频播放/下载区。
