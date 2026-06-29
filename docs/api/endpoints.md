# 青禾映画 · API 接口文档

> 记录后端接口约定、认证方式、请求/响应格式及第三方服务对接说明。

---

## 1. 认证方式

除 `GET /api/health` 外，所有 `/api/*` 业务接口均需 JWT Bearer Token。

### 1.1 登录获取 Token

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

**响应示例**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "username": "admin",
  "role": "admin"
}
```

### 1.2 请求时携带 Token

```http
Authorization: Bearer <access_token>
```

### 1.3 鉴权失败

- 未携带 Token 或 Token 无效 → `401 Unauthorized`
- 权限不足（如需要管理员权限） → `403 Forbidden`

---

## 2. 接口概览

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| POST | `/api/auth/register` | 用户注册 | 公开 |
| POST | `/api/auth/login` | 用户登录 | 公开 |
| GET | `/api/auth/me` | 获取当前用户信息 | 需 Token |
| GET | `/api/health` | 健康检查 | 公开 |
| POST | `/api/generate` | 运行完整多 Agent 流水线（同步） | 需 Token |
| POST | `/api/generate/stream` | SSE 流式返回 Agent 执行进度 | 需 Token |
| POST | `/api/agents/{step}` | 执行单个 Agent 步骤 | 需 Token |
| POST | `/api/text/polish` | AI 润写（一句话 → 完整表单） | 需 Token |
| POST | `/api/topics/generate` | AI 生成爆款候选主题 | 需 Token |
| POST | `/api/images/generate` | AI 生图 | 需 Token |
| POST | `/api/tts/generate` | 语音合成 | 需 Token |
| POST | `/api/video/compose` | 视频合成 | 需 Token |
| POST | `/api/video/mvp` | 一键成片 | 需 Token |
| POST | `/api/image-studio/generate` | 图像工作室 9 宫格生成 | 需 Token |

> 更详细的交互式文档可访问运行中的后端 Swagger：`http://localhost:18739/docs`

---

## 3. 详细接口说明

### 3.1 健康检查

```http
GET /api/health
```

**响应**

```json
{
  "status": "ok"
}
```

---

### 3.2 运行完整流水线

```http
POST /api/generate
Content-Type: application/json
Authorization: Bearer <token>

{
  "product_name": "阳山水蜜桃",
  "origin": "江苏无锡",
  "category": "水果",
  "selling_points": "汁多味甜、地理标志产品",
  "target_platform": "抖音",
  "target_duration": "30-60秒",
  "additional_info": ""
}
```

**响应示例**

```json
{
  "task_id": "a1b2c3d4",
  "status": "success",
  "result": {
    "planner_output": { "theme": "...", "video_type": "..." },
    "copywriter_output": { "hook": { "text": "..." }, "body": [], "cta": {} },
    "scriptwriter_output": { "title": "...", "shots": [] },
    "visual_output": { "visual_style": {}, "shot_prompts": [] },
    "distributor_output": { "platform": "...", "publish_content": {} },
    "final_report": "# 青禾映画 · 短视频创作方案\n...",
    "error": null
  }
}
```

---

### 3.3 SSE 流式流水线

```http
POST /api/generate/stream
Content-Type: application/json
Authorization: Bearer <token>

{
  "product_name": "阳山水蜜桃",
  "origin": "江苏无锡",
  "category": "水果",
  "selling_points": "汁多味甜、地理标志产品",
  "target_platform": "抖音",
  "target_duration": "30-60秒"
}
```

**SSE 事件类型**

| 事件 | 说明 |
|------|------|
| `start` | 流水线开始 |
| `node_start` | 某个 Agent 开始执行 |
| `node_update` | Agent 执行进度更新 |
| `error` | 执行出错 |
| `complete` | 流水线完成 |

---

### 3.4 单步执行 Agent

```http
POST /api/agents/{step}
Content-Type: application/json
Authorization: Bearer <token>
```

`{step}` 可选值：

- `planner`
- `copywriter`
- `scriptwriter`
- `visual_designer`
- `distributor`
- `report_generator`

**请求体**

```json
{
  "input": {
    "product_name": "阳山水蜜桃",
    "origin": "江苏无锡",
    "target_platform": "抖音"
  },
  "state": {
    "planner_output": { "theme": "..." }
  }
}
```

**响应**：返回更新后的完整状态 `GenerateResult`。

---

### 3.5 AI 润写

```http
POST /api/text/polish
Content-Type: application/json
Authorization: Bearer <token>

{
  "product_name": "阳山水蜜桃",
  "one_liner": "想拍一个产地溯源的短视频",
  "target_platform": "抖音",
  "target_duration": "30-60秒"
}
```

**响应**：补全后的 `UserInput` 字段。

---

### 3.6 AI 选题

```http
POST /api/topics/generate
Content-Type: application/json
Authorization: Bearer <token>

{
  "product_name": "阳山水蜜桃",
  "one_liner": "想拍一个产地溯源的短视频",
  "target_platform": "抖音",
  "count": 6
}
```

**响应**

```json
{
  "status": "success",
  "topics": [
    {
      "theme": "爆款主题标题",
      "creative_angle": "创意角度",
      "pain_point": "用户痛点",
      "target_audience": "预期受众",
      "traffic_hook": "开头3秒钩子",
      "appeal_reason": "爆款潜力说明"
    }
  ]
}
```

---

### 3.7 AI 生图

```http
POST /api/images/generate
Content-Type: application/json
Authorization: Bearer <token>

{
  "prompt": "A ripe peach on a wooden table, warm sunlight, cinematic...",
  "negative_prompt": "text, watermark, blurry",
  "size": "1920x1920",
  "n": 1
}
```

**响应**

```json
{
  "status": "success",
  "images": [
    {
      "url": "https://...",
      "revised_prompt": "..."
    }
  ]
}
```

---

### 3.8 语音合成

```http
POST /api/tts/generate
Content-Type: application/json
Authorization: Bearer <token>

{
  "text": "这是要合成的口播文案",
  "voice": "zh-CN-XiaoxiaoNeural",
  "rate": "+0%",
  "volume": "+0%"
}
```

**响应**

```json
{
  "status": "success",
  "audio_url": "/outputs/audio/xxx.mp3",
  "audio_path": "outputs/audio/xxx.mp3"
}
```

---

### 3.9 视频合成

```http
POST /api/video/compose
Content-Type: application/json
Authorization: Bearer <token>

{
  "image_urls": [
    "https://.../shot1.jpg",
    "https://.../shot2.jpg"
  ],
  "audio_path": "outputs/audio/xxx.mp3",
  "resolution": "1080x1920",
  "fps": 30
}
```

**响应**

```json
{
  "status": "success",
  "video_url": "/outputs/video/xxx.mp4",
  "video_path": "outputs/video/xxx.mp4",
  "duration_seconds": 14
}
```

---

### 3.10 一键成片

```http
POST /api/video/mvp
Content-Type: application/json
Authorization: Bearer <token>

{
  "state": {
    "copywriter_output": { "full_script": "..." },
    "visual_output": { "shot_prompts": [...] }
  }
}
```

**说明**：后端自动完成「出图 → TTS → 视频合成」。

---

### 3.11 图像工作室

```http
POST /api/image-studio/generate
Content-Type: multipart/form-data
Authorization: Bearer <token>
```

**请求参数**

| 字段 | 类型 | 说明 |
|------|------|------|
| `reference_image` | file | 参考图片 |
| `prompt` | string | 主体描述 |
| `style_notes` | string | 风格补充说明 |
| `target_platform` | string | 目标平台（默认抖音） |

**响应**

```json
{
  "status": "success",
  "grid_url": "/outputs/image-studio/xxx_grid.jpg",
  "variant_urls": ["..."]
}
```

---

## 4. 第三方服务对接

### 4.1 LLM 服务

- **协议**：OpenAI-compatible REST API
- **配置项**：`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`
- **可切换提供商**：OpenAI、DeepSeek、通义千问等

### 4.2 图片生成

- **服务商**：豆包 Seedream（通过 OpenAI-compatible 中转）
- **配置项**：`APILINK_API_BASE_URL`, `AIAPIAL_API_KEY`, `IMAGE_MODEL`
- **默认模型**：`doubao-seedream-5-0-260128`
- **默认尺寸**：`1920x1920`

### 4.3 语音合成

- **服务**：Edge-TTS
- **默认音色**：`zh-CN-XiaoxiaoNeural`
- **配置项**：`tts_voice`, `tts_rate`, `tts_volume`

### 4.4 视频合成

- **工具**：MoviePy + Pillow
- **默认分辨率**：`1080x1920`（9:16 竖屏）
- **默认帧率**：30fps

---

## 5. 通用响应约定

### 5.1 成功响应

```json
{
  "status": "success",
  "...": "业务字段"
}
```

### 5.2 错误响应

```json
{
  "detail": "错误描述"
}
```

### 5.3 常见状态码

| 状态码 | 含义 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功（注册） |
| 400 | 请求参数错误 |
| 401 | 未授权 / Token 无效 |
| 403 | 权限不足 |
| 422 | 数据校验失败 |
| 500 | 服务端内部错误 |

---

## 6. 相关文档

- [产品需求文档](../prd.md)
- [提示词与设计文档](../design/prompts.md)
- [项目根目录 README](../../README.md)
