# 图像处理工作室 — 九宫格导演板图方案

## Summary（摘要）

新增独立「图像处理工作室」功能：用户上传物品图或人物图 + 输入主题描述，系统通过 LLM 生成 9 种风格变体的英文生图 prompt（覆盖光照/角度/场景/色调/构图/情绪/材质/镜头/艺术风格 9 个维度），再以用户上传图作为参考图，并发调用 doubao-seedream 图生图 API 保证人物/物品一致性，最终用 Pillow 拼接成 3×3 九宫格导演板图，供广告视频生成参考。

**核心约束**（用户明确要求）：
- 完全独立模块，先不接入 LangGraph 流水线，但接口需模块化便于后续接入
- **每个文件代码不超过 300 行**（比 AGENTS.md 的 500 行更严格）
- 系统提示词放 `qinghe-video/src/prompts/`，使用 **.md 格式**
- 复用现有基础设施（doubao-seedream、httpx、Pillow、JWT 鉴权、/outputs 静态目录）

---

## 产品定位与放置决策

**广告视频创作完整流程**（5 阶段）：

| 阶段 | 名称 | 现有归属 | 本功能关系 |
|------|------|----------|------------|
| 1 | 素材准备 / 创意探索 | **缺失** | **本功能填补** |
| 2 | 脚本创作（planner→copywriter→scriptwriter） | `#/chat` + `#/workshop` 步骤 1-3 | 后续可接入本功能输出 |
| 3 | 分镜视觉设计（visual_designer） | `#/workshop` 步骤 4 | 后续可导入本功能选定的风格 |
| 4 | 素材生成（图片/视频/TTS） | `#/workshop` 的 media-lab | 与本功能互补 |
| 5 | 视频合成 | `#/workshop` 的 video-compose | 本功能九宫格可作参考板 |

**放置决策：独立页面 `#/image-studio`**

理由：
1. **填补流程缺口**：当前项目缺「素材准备/创意探索」前置阶段，工作室正补此位
2. **代码模块化**：后端 `src/image_studio/` 独立包，前端独立 JS/CSS，不动现有超限文件（workshop.js 已 520 行）
3. **产品定位清晰**：作为 `#/chat`（对话创作）和 `#/workshop`（分步工坊）的平级入口，定位为"广告视频创作的视觉前置工具"
4. **后续接入路径**：流水线接入时，在 workshop 的 visual_designer 步骤加「从图像工作室导入风格」按钮，把用户选定的一致性特征词（consistency_key）或九宫格图作为 visual_designer 的参考输入。后端 `image_variants.generate_variants()` / `compose_grid()` 函数签名已保证可被流水线节点直接复用，无需重构。

**导航排序**：顶部导航顺序为 对话创作 → 分步工坊 → **图像工作室** → 规划设计 → Agent 管理 → 关于。图像工作室紧跟 workshop，体现"素材探索→分步执行"的流程衔接。

---

## Current State Analysis（现状分析）

### 可复用基础设施（基于 Phase 1 探索）

| 设施 | 位置 | 复用方式 |
|------|------|----------|
| 图像生成 API 调用 | [image_generation.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/image_generation.py) | 现有 `generate_image()` **不支持参考图**，需扩展或新建并行模块 |
| doubao-seedream 参考图能力 | 火山引擎 API | `POST /v1/images/generations` + `image` 参数（URL 或 `data:image/png;base64,...`），单图/多图均支持 |
| Pillow 图像处理 | `video_compose.py` 已用 | `Image.new/open/crop/resize/LANCZOS`、`ImageDraw.text`，九宫格拼接无需新依赖 |
| LLM 工厂 | [llm.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/nodes/llm.py) `get_llm()` | 复用生成 9 变体 prompt |
| Prompt 加载 | [config.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/config.py) `get_prompt()` | **必须用 `get_prompt()` 而非 `get_system_prompt()`**，因 .md 含 `{变量}` 模板，后者会转义大括号 |
| JWT 鉴权 | `src/auth/dependencies.py` `get_current_user` | 所有新路由复用 |
| 静态输出目录 | `outputs/` 已挂载 `/outputs` | 九宫格图存 `outputs/image/grid_xxx.jpg` |
| 前端 SPA 路由 | [router.js](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/assets/js/router.js) `register()` | 新增 `#/image-studio` |
| 前端命名空间 | `window.Qinghe.xxx` | 新挂 `window.Qinghe.imageStudio` |
| 图片卡片三态 UI | [workshop.js](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/assets/js/workshop.js) `renderSkeletonCard/Success/Error` | 直接借鉴模式，扩为 9 张 |
| 设计令牌 | [workshop.css](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/assets/css/workshop.css) CSS 变量 | 全部复用保持视觉一致 |

### 关键 API 能力确认（WebSearch 验证）

doubao-seedream-5-0-260128 通过 OpenAI 兼容端点 `POST /v1/images/generations` 调用，**支持参考图**：
- 参数 `image`：string（单图 URL 或 base64）或 array（多图，最多 10 张）
- base64 格式：`data:image/png;base64,<编码>`（格式名小写）
- 图片限制：≤30MB、总像素 ≤6000×6000、宽高比 [1/16, 16]、支持 jpeg/png/webp/bmp/tiff/gif
- 现有 `settings.APILINK_API_BASE_URL` + `settings.AIAPIAL_API_KEY` 可直接复用
- 返回 `response_format=url` 时返回 24 小时有效下载链接，需及时下载

### 现有 image_generation.py 的局限

现有 `ImageGenerationRequest` 只有 `prompt/negative_prompt/size/n`，**不含参考图字段**。两条路线：
- **方案 A**：扩展 `ImageGenerationRequest` 加 `image` 字段 → 影响现有 `/api/images/generate` 调用方
- **方案 B（采用）**：新建 `src/image_studio/` 独立模块，自带请求模型，不动现有代码

采用方案 B，符合用户"独立模块化"要求，且避免破坏现有流水线。

---

## Proposed Changes（方案变更）

### 文件结构总览

```
qinghe-video/
├── src/
│   ├── prompts/
│   │   └── image_studio_director_board.md   # 新增：9变体生成系统提示词（.md格式）
│   ├── image_studio/                        # 新增：独立包
│   │   ├── __init__.py                      # ~15行：导出公开接口
│   │   ├── models.py                        # ~110行：Pydantic 请求/响应模型
│   │   ├── prompt_builder.py                # ~140行：LLM生成9变体英文prompt
│   │   ├── image_variants.py                # ~150行：并发调用图生图API（带参考图）
│   │   ├── grid_composer.py                 # ~140行：Pillow九宫格拼接+标注
│   │   └── router.py                        # ~140行：FastAPI APIRouter
│   ├── config.py                            # 修改：新增3个可选配置项
│   └── main.py                              # 修改：注册 image_studio 路由
└── frontend/
    ├── index.html                           # 修改：加导航项、section、link、script
    └── assets/
        ├── css/image-studio.css             # 新增：~220行
        └── js/image-studio.js               # 新增：~280行
```

所有新文件均 ≤300 行，符合用户硬约束。

---

### 1. `src/prompts/image_studio_director_board.md`（新增，~80行）

**作用**：指导 LLM 根据用户上传图类型 + 主题，生成 9 个风格变体的英文生图 prompt。

**格式选择**：用 .md（用户明确要求）。**必须用 `config.get_prompt()` 读取**（非 `get_system_prompt()`），因为内含 `{image_type}`、`{subject}`、`{style_preference}` 模板变量，`get_system_prompt()` 会把 `{`→`{{` 破坏模板。

**内容结构**：
```markdown
# 角色：青禾映画图像处理工作室导演板生成 Agent

你负责根据用户上传的参考图（{image_type}）和主题「{subject}」，生成 9 种风格变体的英文 AI 生图 prompt，用于广告视频导演板。

## 9 个变体维度（固定顺序，每个维度生成 1 条）

1. **光照变体** — 改变光线条件（逆光/侧光/黄金时刻/影棚光等）
2. **视角变体** — 改变拍摄角度（俯拍/仰拍/特写/全景等）
3. **场景变体** — 改变背景环境（户外/室内/极简/繁华等）
4. **色调变体** — 改变色彩风格（冷调/暖调/莫兰迪/高饱和等）
5. **构图变体** — 改变画面构图（三分法/对称/引导线/留白等）
6. **情绪变体** — 改变情绪氛围（活力/静谧/奢华/亲和等）
7. **材质变体** — 改变材质质感（金属/木质/织物/玻璃等，针对物品图）或妆造（针对人物图）
8. **镜头变体** — 改变镜头语言（微距/广角/长焦/鱼眼等）
9. **艺术风格变体** — 改变艺术化处理（胶片/赛博朋克/水彩/极简主义等）

## 用户风格偏好
{style_preference}

## 输出格式（严格 JSON，字段名不可变）

{
  "image_type": "person|product",
  "subject": "用户主题",
  "consistency_key": "从参考图中提取的人物/物品关键特征描述（英文，用于在9个变体中保持一致性）",
  "variants": [
    {
      "variant_id": 1,
      "dimension": "lighting",
      "dimension_label": "光照·黄金时刻",
      "prompt": "完整英文生图prompt，必须包含consistency_key描述以保持人物/物品一致",
      "negative_prompt": "英文负向提示词"
    }
  ]
}

## 约束
- 9 个 variant 严格对应上述 9 个维度，variant_id 1-9
- 每个 prompt 必须显式包含 consistency_key 中的关键特征，确保人物/物品在 9 张图中保持一致
- prompt 用英文，自然语言描述主体+行为+环境+风格，建议 60-120 词
- 输出纯 JSON，不要 markdown 代码块包裹
```

---

### 2. `src/image_studio/models.py`（新增，~110行）

**Pydantic 模型**，遵循项目 `ConfigDict(extra="forbid")` 约定。

```python
class ImageStudioRequest(BaseModel):
    """工作室请求（JSON 体，不含文件）"""
    model_config = ConfigDict(extra="forbid")
    image_type: Literal["person", "product"]
    subject: str = Field(..., min_length=1, max_length=200, description="主题描述")
    style_preference: str | None = Field(None, description="可选风格偏好")
    size: str | None = Field(None, description="单图尺寸，默认 1024x1024")

class StyleVariant(BaseModel):
    """单个风格变体（LLM 输出）"""
    model_config = ConfigDict(extra="forbid")
    variant_id: int
    dimension: str
    dimension_label: str
    prompt: str
    negative_prompt: str

class DirectorBoardOutput(BaseModel):
    """LLM 生成的 9 变体结构化输出"""
    model_config = ConfigDict(extra="forbid")
    image_type: str
    subject: str
    consistency_key: str
    variants: list[StyleVariant]  # 长度应为 9

class VariantImageResult(BaseModel):
    """单张变体图生成结果"""
    variant_id: int
    dimension_label: str
    prompt: str
    image_url: str | None = None       # /outputs/image/variant_xxx.jpg
    b64_json: str | None = None
    error: str | None = None

class GridResult(BaseModel):
    """九宫格最终结果"""
    model_config = ConfigDict(extra="forbid")
    grid_url: str                       # /outputs/image/grid_xxx.jpg
    variants: list[VariantImageResult]
    consistency_key: str
    subject: str
```

---

### 3. `src/image_studio/prompt_builder.py`（新增，~140行）

**职责**：调用 LLM 生成 9 变体英文 prompt。

**核心函数**：
```python
def build_variant_prompts(image_type: str, subject: str, style_preference: str | None) -> DirectorBoardOutput:
    """读取 .md 模板 → 填充变量 → LLM 结构化输出 → 返回 9 变体"""
```

**实现要点**：
- 用 `config.get_prompt("image_studio_director_board")` 读取原文（**非 get_system_prompt**）
- 因 .md 含 `{image_type}` 等变量，用 `str.format_map()` 或 `str.format()` 填充（注意若 prompt 内有其他 `{}` 需转义；本 prompt 设计上只有 3 个变量）
- 调 `get_llm(temperature=0.8).with_structured_output(DirectorBoardOutput)`
- 用 `ChatPromptTemplate.from_messages([("system", filled_prompt), ("human", "请生成 9 个变体。")])`
- 校验 `len(variants) == 9`，不足抛错
- 异常处理：捕获 ValidationError、Exception，封装为 RuntimeError 抛出

---

### 4. `src/image_studio/image_variants.py`（新增，~150行）

**职责**：以用户上传图为参考，并发调用 doubao-seedream 图生图 API 生成 9 张图。

**核心函数**：
```python
async def generate_variants(
    variants: list[StyleVariant],
    reference_image_b64: str,        # data:image/png;base64,...
    size: str,
) -> list[VariantImageResult]:
    """并发 9 张图生图，下载到 outputs/image/，返回结果列表"""
```

**实现要点**：
- 用 `asyncio.gather(*[...], return_exceptions=True)` 并发 9 个任务
- 每个任务调 `_generate_single(variant, ref_b64, size)`：
  - POST `{APILINK_API_BASE_URL}/v1/images/generations`
  - payload 含 `model`、`prompt`、`negative_prompt`、`size`、`image=ref_b64`、`response_format="url"`、`watermark=False`
  - httpx.AsyncClient(timeout=180)
- 响应中取 `data[0].url`，用 httpx 下载图片字节，存 `outputs/image/variant_{variant_id}_{ts}.jpg`
- 失败任务填 `error` 字段，不阻断其他任务
- 返回 `list[VariantImageResult]`，按 variant_id 排序

**辅助函数**：
- `_encode_upload_to_b64(file_bytes: bytes, content_type: str) -> str`：转 `data:image/png;base64,...`
- `_download_and_save(url: str, variant_id: int) -> str`：下载图返回 `/outputs/image/...` 相对路径

---

### 5. `src/image_studio/grid_composer.py`（新增，~140行）

**职责**：用 Pillow 把 9 张图拼成 3×3 九宫格，叠加维度标签。

**核心函数**：
```python
def compose_grid(
    variants: list[VariantImageResult],
    output_path: Path,
    cell_size: tuple[int, int] = (640, 640),
    gap: int = 16,
    label_height: int = 40,
) -> str:
    """拼九宫格，返回 /outputs/image/grid_xxx.jpg 相对路径"""
```

**实现要点**：
- 仅取成功生成的图（`error is None`），失败的格子用灰色占位 + "生成失败"文字
- 每张图 `Image.open` → `resize` 到 `cell_size`（用 `LANCZOS`，参考 `video_compose.py`）
- 画布尺寸：`W = cell_w*3 + gap*4`，`H = (cell_h+label_height)*3 + gap*4`
- 用 `ImageDraw.text` 在每格底部标签条写 `dimension_label`（字体用 PIL 默认或加载系统字体）
- 保存 JPEG quality=90 到 `outputs/image/grid_{timestamp}.jpg`
- 返回 `/outputs/image/grid_{timestamp}.jpg`（前端可直接 `<img src=...>`）

---

### 6. `src/image_studio/router.py`（新增，~140行）

**职责**：FastAPI APIRouter，定义端点。

**端点**：
```python
@router.post("/api/image-studio/generate", summary="生成九宫格导演板")
async def generate_director_board(
    image_type: str = Form(...),          # "person" | "product"
    subject: str = Form(...),
    style_preference: str | None = Form(None),
    size: str | None = Form(None),
    reference_image: UploadFile = File(...),
    _user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """完整流程：上传图 → LLM生成9变体prompt → 并发图生图 → 拼九宫格 → 返回"""
```

**流程**：
1. 校验 `image_type in ("person","product")`、`subject` 非空、`reference_image.content_type` 是图片
2. 读 `reference_image.file.read()` → 转 base64
3. 调 `build_variant_prompts(image_type, subject, style_preference)` 得 9 变体
4. 调 `await generate_variants(variants, ref_b64, size)` 得 9 张图
5. 调 `compose_grid(variants, output_path)` 得九宫格
6. 返回 `{"status":"success","grid_url":..., "variants":[...], "consistency_key":...}`

**异常处理**：try/except 包裹，`logger.exception` + `HTTPException(500)`，遵循 main.py 模式。

**鉴权**：所有端点 `Depends(get_current_user)`，前端 `auth.js` 自动加 Bearer token。

---

### 7. `src/image_studio/__init__.py`（新增，~15行）

```python
"""图像处理工作室：九宫格导演板图生成。"""
from src.image_studio.router import router as image_studio_router
__all__ = ["image_studio_router"]
```

---

### 8. `src/config.py`（修改，新增3项）

在 Settings 类中追加（可选配置，有默认值）：
```python
IMAGE_STUDIO_CELL_SIZE: str = "640x640"     # 九宫格单格尺寸
IMAGE_STUDIO_GRID_GAP: int = 16             # 九宫格间距
IMAGE_STUDIO_LABEL_HEIGHT: int = 40         # 标签条高度
```
不新增必需配置，沿用 `IMAGE_MODEL`/`APILINK_API_BASE_URL`/`AIAPIAL_API_KEY`。

---

### 9. `src/main.py`（修改，2处）

**import 区**追加：
```python
from src.image_studio import image_studio_router
```

**路由注册区**（与其他 `app.include_router` 同位置）追加：
```python
app.include_router(image_studio_router)
```

不改动其他逻辑，main.py 增量约 2 行。

---

### 10. `frontend/index.html`（修改，4处）

**(a)** 顶部导航 `<nav class="site-nav">` 内追加：
```html
<a href="#/image-studio" data-route="image-studio">图像工作室</a>
```

**(b)** `<head>` 内 CSS 区追加（在 workshop.css 之后）：
```html
<link rel="stylesheet" href="assets/css/image-studio.css?v=1" />
```

**(c)** 新增 `<section class="page-section" id="imageStudioPage">`（结构参考 workshopPage）：
```html
<section class="page-section" id="imageStudioPage">
  <div class="studio-container">
    <header class="studio-head">
      <span class="eyebrow">IMAGE STUDIO</span>
      <h2 class="section-title">九宫格导演板</h2>
      <p class="section-desc">上传物品或人物参考图，生成 9 种风格变体，拼接为导演板用于广告视频创作。</p>
    </header>
    <form id="studioForm" class="studio-form">
      <!-- 图像类型选择、主题输入、风格偏好、文件上传、生成按钮 -->
    </form>
    <div id="studioGrid" class="studio-grid"><!-- 9 格卡片渲染区 --></div>
    <div id="studioResult" class="studio-result"><!-- 九宫格预览 + 下载 --></div>
  </div>
</section>
```

**(d)** `<body>` 末尾 JS 区，在 app.js 之前追加：
```html
<script src="assets/js/image-studio.js?v=1"></script>
```

---

### 11. `frontend/assets/js/image-studio.js`（新增，~280行）

**命名空间**：`window.Qinghe.imageStudio`（参考 video-compose-ui.js 模式）。

**职责**：
- 表单提交 → `FormData`（含文件）→ `fetch('/api/image-studio/generate', {headers: auth, body: formData})`
- 提交后立即渲染 9 个骨架卡片（参考 workshop.js `renderSkeletonCard`）
- 响应返回后渲染 9 张图（成功/失败三态）+ 九宫格预览 + 下载按钮
- 单张重生（可选，MVP 可不做）

**关键函数**：
```javascript
window.Qinghe = window.Qinghe || {};
(function(Q){
  const STUDIO_API = '/api/image-studio/generate';
  function init() { /* 绑定表单提交 */ }
  async function handleSubmit(e) { /* FormData + fetch + 渲染 */ }
  function renderSkeletonGrid() { /* 9 个骨架卡 */ }
  function renderResults(data) { /* 9 张图 + 九宫格预览 */ }
  function renderCardSuccess(variant) { /* 单张成功卡 */ }
  function renderCardError(variant) { /* 单张失败卡 */ }
  function renderGridPreview(gridUrl) { /* 九宫格大图 + 下载 */ }
  Q.imageStudio = { init };
})(window.Qinghe);
```

**鉴权**：所有 fetch 经 `auth.js` 的 `authFetch` 或手动加 `Authorization: Bearer <token>`（参考 workshop.js 调用模式）。

---

### 12. `frontend/assets/css/image-studio.css`（新增，~220行）

**复用 workshop.css 设计令牌**（CSS 变量 `--color-brand`、`--radius`、`--shadow-md` 等）。

**关键样式**：
- `.studio-container` / `.studio-head` / `.studio-form` — 容器与表单
- `.studio-form` — grid 布局，左列上传区，右列参数
- `.studio-upload` — 拖拽上传区（可简化为 `<input type="file">` + 预览）
- `.studio-grid` — `display:grid; grid-template-columns: repeat(3, 1fr); gap: var(--radius);` 9 格卡片
- `.studio-card` — 复用 workshop 的 `.image-card` 三态样式（loading/success/error）
- `.studio-result` — 九宫格预览区，`<img>` 居中 + 下载按钮
- `.studio-card__label` — 维度标签（如"光照·黄金时刻"）
- 响应式：`@media (max-width: 900px)` 网格转 2 列，`(max-width: 560px)` 转 1 列

---

## Assumptions & Decisions（假设与决策）

### 关键决策

1. **不扩展现有 image_generation.py**：新建独立 `src/image_studio/` 包，避免影响现有 `/api/images/generate` 调用方。符合用户"独立模块化"要求。

2. **prompt 用 .md + `get_prompt()`**：用户明确要求 .md 格式。因 .md 含 `{变量}`，必须用 `config.get_prompt()`（非 `get_system_prompt()`，后者转义大括号会破坏模板）。

3. **9 变体固定维度**：光照/视角/场景/色调/构图/情绪/材质/镜头/艺术风格 9 个维度，由 LLM 一次性结构化输出。维度固定便于前端展示与后续接入流水线。

4. **参考图用 base64 传输**：用户上传图经 `UploadFile` 读取字节 → 转 `data:image/png;base64,...` → 作为 doubao-seedream 的 `image` 参数。不存中间文件，简单直接。

5. **并发 9 张图生图**：用 `asyncio.gather(return_exceptions=True)`，单张失败不阻断其余。失败的格子九宫格中用灰色占位。

6. **九宫格用 Pillow 拼接**：3×3 网格，每格含图片 + 维度标签条，保存为 JPEG 到 `outputs/image/`。复用 `video_compose.py` 的 Pillow 用法。

7. **同步端点（MVP 不做 SSE）**：用户要求"先独立起来"，MVP 用同步 `POST /api/image-studio/generate`，9 张图并发但整体等待。后续可加 SSE 流式端点（参考 main.py 的 `_format_sse` 模式）。

8. **不接入 QingheState**：当前图像生成本就游离于 LangGraph 流水线之外（参考 visual_designer 只生成 prompt 不生图）。工作室独立运作，后续接入时再在 state 加字段。

### 假设

- `AIAPIAL_API_KEY` 已在 .env 配置（现有 `/api/images/generate` 已依赖此 key）
- doubao-seedream 中转站 `APILINK_API_BASE_URL` 支持参考图 `image` 参数（标准 OpenAI 兼容 Seedream 端点均支持，Phase 1 已验证）
- 用户上传图格式为 jpeg/png/webp（doubao-seedream 支持范围）
- 前端 `auth.js` 已全局可用，`fetch` 自动带 Bearer token
- `outputs/image/` 目录可自动创建（参考 main.py 启动时创建 `_AUDIO_DIR`/`_VIDEO_DIR` 的模式，需在 main.py 启动事件中补建 `outputs/image/`，或 grid_composer 中 `mkdir(parents=True, exist_ok=True)`）

### 非目标（MVP 不做）

- SSE 流式进度推送
- 单张变体重生按钮（先整体生成）
- 九宫格切图模式（用户已选"9 种风格变体"）
- 接入 LangGraph state
- 状态持久化（sessionStorage，AGENTS.md 已记录的 bug 涉及全局，本工作室 MVP 不做）
- 多参考图融合（MVP 仅单图参考）

---

## Verification Steps（验证步骤）

### 1. 单元验证（无需 LLM/API key）

- `pytest tests/ -v` 现有测试仍通过（确认未破坏现有功能）
- 新增 `tests/test_image_studio_models.py`（可选）：
  - `test_image_studio_request_forbids_extra`：验证 `extra="forbid"`
  - `test_director_board_output_accepts_9_variants`：验证 9 变体结构
  - `test_grid_composer_handles_partial_failures`：模拟 3 张失败，九宫格仍有 9 格

### 2. 集成验证（需 API key + 启动服务）

```bash
cd qinghe-video
uvicorn src.main:app --host 0.0.0.0 --port 18739 --reload
```

- 访问 `http://localhost:18739/#/image-studio` 看到工作室页面
- 登录后上传一张物品图 + 输入主题（如"便携咖啡杯"）+ 选择 image_type=product
- 点击生成，等待 9 张图并发完成
- 看到 9 格卡片（成功显示图，失败显示错误）+ 九宫格预览大图 + 下载按钮
- 下载九宫格 JPEG，确认 3×3 布局、维度标签正确、人物/物品外观一致

### 3. API 直测

```bash
# 获取 token
curl -X POST http://localhost:18739/api/auth/login -d "username=admin&password=admin123"

# 生成九宫格（用 token）
curl -X POST http://localhost:18739/api/image-studio/generate \
  -H "Authorization: Bearer <TOKEN>" \
  -F "image_type=product" \
  -F "subject=便携咖啡杯" \
  -F "style_preference=简约现代" \
  -F "reference_image=@test.jpg"
```

预期返回：
```json
{
  "status": "success",
  "grid_url": "/outputs/image/grid_1719480000.jpg",
  "consistency_key": "white ceramic mug with bamboo lid, minimalist design",
  "variants": [{"variant_id":1, "dimension_label":"光照·黄金时刻", "image_url":"/outputs/image/variant_1_xxx.jpg", ...}, ...]
}
```

### 4. 文件行数检查

实现后用 `wc -l` 或 IDE 检查每个新文件 ≤300 行：
- `src/image_studio/*.py` 各文件
- `frontend/assets/js/image-studio.js`
- `frontend/assets/css/image-studio.css`
- `src/prompts/image_studio_director_board.md`

### 5. 后续接入流水线的接口预留

模块化设计确保后续可在 `agent_steps.py` 加 `image_studio` 步骤，或在 `QingheState` 加 `image_grid_url: str` 字段后，从 `visual_output.shot_prompts` 取镜头调用 `image_variants.generate_variants()`。本方案不实现接入，但 `generate_variants()` / `compose_grid()` 函数签名已保证可被流水线节点直接复用。
