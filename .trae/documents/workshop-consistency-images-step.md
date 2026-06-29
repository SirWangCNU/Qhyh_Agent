# 工坊新增「人物/物品/场景一致性生图」步骤（新第 3 步）

## Summary

在分步工坊的 8 步流水线中，**插入一个新的第 3 步「一致性生图」**（位于第 2 步「文案」与原第 3 步「脚本」之间），原第 3-8 步顺延为第 4-9 步。该步骤支持三类一致性参考图生成：

- **人物 (character)**：角色设定集布局（左侧大图 + 中间三列全身图 + 右侧 2×3 六宫格 = 单张合成大图）
- **物品 (object)**：3×3 九宫格（正面/背面/左右侧/俯仰视/细节/场景/包装 = 单张合成大图）
- **场景 (scene)**：2×2 四面环视图（正/背/左/右四个方向 = 单张合成大图）

**生成策略**：单次生成整张图——把完整布局提示词作为一次 doubao-seedrem API 调用，直接产出已排好版的合成大图（不拆分多次调用、不用 Pillow 拼图）。

**参考图**：三类都可选。上传参考图 → 走图生图（payload 带 `image` 字段）；不上传 → 走纯文生图。

---

## Current State Analysis

### 现有工坊步骤（`frontend/src/lib/constants.ts:107-116`）

| num | key | type | title |
|---|---|---|---|
| 1 | planner | llm | 策划 |
| 2 | copywriter | llm | 文案 |
| 3 | scriptwriter | llm | 脚本 |
| 4 | visual_designer | llm | 视觉 |
| 5 | distributor | llm | 投放 |
| 6 | image_gen | image | 出图 |
| 7 | tts | tts | 配音 |
| 8 | compose | compose | 合成 |

- `WorkshopStepKey = NodeKey | "image_gen" | "tts" | "compose"`（`constants.ts:84`）
- `DEFAULT_AUTO_RUN_TO = 4`（`constants.ts:119`）
- `agent_steps.py:20-27` 的 `AgentStep` Literal **只含 6 个 LLM 节点**，`image_gen/tts/compose` 是纯前端步骤直接调媒体 API——本新步骤同此模式，**不改 agent_steps.py**。

### 现有图生图能力（`src/image_studio/image_variants.py`）

- `encode_upload_to_b64(file_bytes, content_type)` → data URI（`image_variants.py:28`）— **可直接复用**
- `_generate_single`（`image_variants.py:61`）payload 含 `"image": reference_image_b64` + `"watermark": False`（`image_variants.py:75-76`）
- 端点：`POST {APILINK_API_BASE_URL}/v1/images/generations`，180s 超时
- 结果处理：优先下载 URL 到 `outputs/image/`；若返回 b64 直接存盘
- **纯文生图**（`src/image_generation.py:34`）payload **不带** `image` 字段，其余相同

### 现有图像工作室路由模式（`src/image_studio/router.py`）

- `POST /api/image-studio/generate` multipart/form-data：`Form(...)` 字段 + `UploadFile = File(...)` + `Depends(get_current_user)`
- 允许 MIME：`{image/jpeg, image/jpg, image/png, image/webp}`（`router.py:25`）
- 路由注册：`main.py:65` `app.include_router(image_studio_router)`

### 工坊前端执行流（`pages/WorkshopPage.tsx`）

- `executeStep(key)`（`WorkshopPage.tsx:126`）按 `cfg.type` 分发：`llm` → `execLLMStep`；`image` → `execImageGen`（`WorkshopPage.tsx:192`）；`tts` → `execTTS`；`compose` → `execCompose`
- `execImageGen` 用 `useGenerateImage` hook 逐镜调 `/api/images/generate`，结果写入 `mediaResults.images`
- 状态：`useWorkshopStore`（zustand + sessionStorage 持久化），`mediaResults: { images, audioUrl, audioPath, videoUrl }`（`workshop-store.ts:25-30`）

### 步骤内容渲染（`components/workshop/WorkshopStepDetail.tsx:24`）

`WorkshopStepContent` 按 `step` 分支：LLM 步骤 → `<AgentOutputView>`；`image_gen` → 4 图网格；`tts` → `<audio>`；`compose` → `<video>`。

---

## Assumptions & Decisions

1. **新步骤 key**：`"consistency_images"`，`type: "image"`，`deps: ["copywriter"]`（依赖第 2 步文案产出，可从中预填主体描述；但实际允许用户手填，不强校验依赖完成）
2. **步骤位置**：新步骤 num=3，原 scriptwriter/visual_designer/distributor/image_gen/tts/compose 的 num 顺延为 4/5/6/7/8/9
3. **`DEFAULT_AUTO_RUN_TO`**：保持 4 不变（即自动执行到「脚本」完成，不自动跑一致性生图——它需要用户主动上传/输入，不适合自动流）
4. **生成策略**：单次 API 调用产单张合成大图，**不调用 LLM 生成 prompt**（直接用固定模板 + `str.replace` 填占位符），**不用 Pillow 拼图**
5. **参考图可选**：`reference_image: UploadFile = File(None)`；有则 `encode_upload_to_b64` 后 payload 加 `image` 字段，无则纯文生图
6. **每类独立调用**：前端 3 个子卡片各自调一次 `/api/consistency-images/generate`，互不阻塞；步骤整体状态 = 至少一类成功即 "done"（用户可后续补跑其他类）
7. **结果存储**：`mediaResults` 新增 `characterImage / objectImage / sceneImage` 三字段（`{ url, prompt, mode } | null`）
8. **Prompt 模板**：3 个独立 .md 文件，含 `{subject}` / `{style_preference}` 占位符，用 `str.replace` 填充（不用 `str.format`，因模板含 JSON/布局描述的大括号；不用 `config.get_system_prompt`，会转义大括号）
9. **配置复用**：复用 `IMAGE_MODEL` / `APILINK_API_BASE_URL` / `AIAPIAL_API_KEY` / `IMAGE_RESPONSE_FORMAT`；`size` 默认取 `settings.IMAGE_SIZE`，前端可传 `size` 覆盖
10. **文件保存**：`outputs/image/consistency_{type}_{ts}.jpg`，返回相对 URL `/outputs/image/...`
11. **后续 image_gen 步骤不改动**：本次不接入「用一致性图作为逐镜出图参考」的能力，留作后续增强（在 plan 末尾备注）

---

## Proposed Changes

### 一、后端：新建 `src/consistency_images/` 模块

#### 1.1 `qinghe-video/src/consistency_images/__init__.py`
导出 `consistency_images_router`。仿 `src/image_studio/__init__.py`。

```python
"""人物/物品/场景一致性生图模块。"""
from src.consistency_images.router import router as consistency_images_router

__all__ = ["consistency_images_router"]
```

#### 1.2 `qinghe-video/src/consistency_images/models.py`
Pydantic v2 模型，全部 `ConfigDict(extra="forbid")`。

```python
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

class ConsistencyImageRequest(BaseModel):
    """一致性生图请求（仅用于内部校验，实际路由用 Form）。"""
    model_config = ConfigDict(extra="forbid")
    image_type: Literal["character", "object", "scene"]
    subject: str = Field(min_length=1)
    style_preference: str | None = None
    size: str | None = None
    negative_prompt: str | None = None

class ConsistencyImageResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    image_type: Literal["character", "object", "scene"]
    image_url: str
    prompt: str
    consistency_mode: Literal["image_to_image", "text_to_image"]
    subject: str
```

#### 1.3 `qinghe-video/src/consistency_images/prompt_builder.py`
读取 3 个 .md 模板，按 `image_type` 选择对应模板，`str.replace` 填占位符。

```python
from src.config import PROJECT_ROOT

_PROMPT_DIR = PROJECT_ROOT / "src" / "prompts"
_TEMPLATE_FILES = {
    "character": "consistency_images_character.md",
    "object": "consistency_images_object.md",
    "scene": "consistency_images_scene.md",
}

def _load_template(image_type: str) -> str:
    path = _PROMPT_DIR / _TEMPLATE_FILES[image_type]
    if not path.exists():
        raise FileNotFoundError(f"找不到 prompt 文件: {path}")
    return path.read_text(encoding="utf-8")

def build_prompt(image_type: str, subject: str, style_preference: str | None) -> str:
    """str.replace 填充占位符，避免与模板内大括号冲突。"""
    template = _load_template(image_type)
    filled = template.replace("{subject}", subject.strip())
    filled = filled.replace(
        "{style_preference}",
        style_preference.strip() if style_preference and style_preference.strip()
        else "（用户未指定风格偏好，按默认棚拍/写实风格生成）",
    )
    return filled
```

#### 1.4 `qinghe-video/src/consistency_images/image_generator.py`
单张图生成：有参考图 → 图生图；无 → 纯文生图。复用 `image_studio.image_variants.encode_upload_to_b64`。

```python
import base64, time, logging
import httpx
from src.config import PROJECT_ROOT, settings
from src.image_studio.image_variants import encode_upload_to_b64  # 复用

logger = logging.getLogger(__name__)
_OUTPUT_DIR = PROJECT_ROOT / "outputs" / "image"

async def generate_consistency_image(
    prompt: str,
    image_type: str,
    size: str | None,
    negative_prompt: str | None,
    reference_image_bytes: bytes | None,
    reference_content_type: str | None,
) -> tuple[str, str]:
    """返回 (image_url, consistency_mode)。"""
    size = size or settings.IMAGE_SIZE
    payload: dict = {
        "model": settings.IMAGE_MODEL,
        "prompt": prompt,
        "size": size,
        "n": 1,
        "response_format": settings.IMAGE_RESPONSE_FORMAT,
        "watermark": False,
    }
    if negative_prompt:
        payload["negative_prompt"] = negative_prompt
    mode = "text_to_image"
    if reference_image_bytes:
        ref_b64 = encode_upload_to_b64(reference_image_bytes, reference_content_type or "image/jpeg")
        payload["image"] = ref_b64
        mode = "image_to_image"

    base_url = settings.APILINK_API_BASE_URL.rstrip("/")
    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.post(
            f"{base_url}/v1/images/generations",
            headers={"Authorization": f"Bearer {settings.AIAPIAL_API_KEY}"},
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json().get("data", [])
        if not data:
            raise RuntimeError("API 未返回图像数据")
        item = data[0]
        _OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        ts = int(time.time() * 1000)
        filename = f"consistency_{image_type}_{ts}.jpg"
        if item.get("url"):
            img_resp = await client.get(item["url"])
            img_resp.raise_for_status()
            (_OUTPUT_DIR / filename).write_bytes(img_resp.content)
        elif item.get("b64_json"):
            (_OUTPUT_DIR / filename).write_bytes(base64.b64decode(item["b64_json"]))
        else:
            raise RuntimeError("API 返回数据无 url 也无 b64_json")
    return f"/outputs/image/{filename}", mode
```

#### 1.5 `qinghe-video/src/consistency_images/router.py`
FastAPI 路由，multipart，`Depends(get_current_user)`。参考图可选。

```python
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from src.auth.dependencies import get_current_user
from src.consistency_images.image_generator import generate_consistency_image
from src.consistency_images.prompt_builder import build_prompt
from src.db.models import User

router = APIRouter(tags=["consistency-images"])
_ALLOWED = {"image/jpeg", "image/jpg", "image/png", "image/webp"}

@router.post("/api/consistency-images/generate")
async def generate(
    image_type: str = Form(...),
    subject: str = Form(...),
    style_preference: str | None = Form(None),
    size: str | None = Form(None),
    negative_prompt: str | None = Form(None),
    reference_image: UploadFile | None = File(None),
    _user: User = Depends(get_current_user),
) -> dict:
    if image_type not in ("character", "object", "scene"):
        raise HTTPException(400, "image_type 必须为 character/object/scene")
    if not subject.strip():
        raise HTTPException(400, "subject 不能为空")
    ref_bytes, ref_ct = None, None
    if reference_image is not None:
        if reference_image.content_type not in _ALLOWED:
            raise HTTPException(400, f"不支持的图片格式：{reference_image.content_type}")
        ref_bytes = await reference_image.read()
        ref_ct = reference_image.content_type
        if not ref_bytes:
            raise HTTPException(400, "参考图文件为空")

    prompt = build_prompt(image_type, subject, style_preference)
    image_url, mode = await generate_consistency_image(
        prompt, image_type, size, negative_prompt, ref_bytes, ref_ct
    )
    return {
        "status": "success",
        "image_type": image_type,
        "image_url": image_url,
        "prompt": prompt,
        "consistency_mode": mode,
        "subject": subject,
    }

@router.get("/api/consistency-images/health")
def health(_user: User = Depends(get_current_user)) -> dict:
    return {"status": "ok", "module": "consistency-images"}
```

### 二、后端：新建 3 个 Prompt 模板

#### 2.1 `qinghe-video/src/prompts/consistency_images_character.md`
基于用户提供的模板，顶部加 `{subject}` / `{style_preference}` 占位符行。

```markdown
主体描述：{subject}
风格偏好：{style_preference}

帮我生成图片：角色设定参考图，严格按照模板布局生成。
纯白色摄影棚背景，真实棚拍人像风格，清晰对焦，统一光影。

人物必须与参考图保持一致：
* 相同五官
* 相同发型与发色
* 相同服装
* 相同人物气质

禁止动漫、插画、卡通、3D渲染风格。
保留真实皮肤纹理与自然摄影质感。

【固定布局】
1. 左侧大区域（1/3宽度）：人物正面胸像特写，中性表情，直视镜头。
2. 中间第一列（1/6宽度）：人物正面全身图，标准站姿，正对镜头。
3. 中间第二列（1/6宽度）：人物侧面全身图，展示完整侧面轮廓。
4. 中间第三列（1/6宽度）：人物背面全身图，完整展示背部发型与服装。
5. 右侧六宫格（2列×3行）：6张胸像特写，保持同一人物与统一棚拍风格。

【六宫格要求】
* 最关键不同表情差异巨大，能看出是在不同的情绪状态
* 六张图必须具有明显差异：不同头部角度、不同视线方向、不同构图距离
* 允许自然的：抬头、低头、偏头、轻微侧脸、侧眼视线、不同神态变化
* 避免所有小图都使用同一个正面角度
* 避免仅通过嘴角变化区分表情

整体效果需要像专业"角色设定集"的情绪展示页，每张图都像独立拍摄的人像照片，
但保持统一的摄影棚光线与人物一致性。

【统一要求】
* 所有小图都需要保持同一个人的面部骨相与五官稳定性
* 所有图片必须是同一个人
* 服装细节保持一致
* 背景纯白干净
* 光影与色调统一
* 不允许出现额外饰品或多余元素
* 必须完整生成正面、侧面、背面三视图
* 六宫格之间必须具有明显差异，避免重复姿势
```

#### 2.2 `qinghe-video/src/prompts/consistency_images_object.md`
物品 3×3 九宫格，6 方向视图 + 3 细节/场景图。

```markdown
主体描述：{subject}
风格偏好：{style_preference}

帮我生成图片：物品设定参考图，严格按照模板布局生成。
纯白色摄影棚背景，专业产品摄影风格，清晰对焦，统一光影。

物品必须与参考图保持一致：
* 相同形状与轮廓
* 相同颜色与材质
* 相同品牌标识与文字（如有）
* 相同细节与做工

禁止动漫、插画、卡通、3D渲染风格。
保留真实材质纹理与自然摄影质感。

【固定布局 - 3×3 九宫格】
1. 正面主视图（中心位，物品正面完整展示）
2. 背面视图（物品背面完整展示）
3. 左侧视图（物品左侧面 90 度角）
4. 右侧视图（物品右侧面 90 度角）
5. 俯视图（从正上方俯视）
6. 仰视图（从正下方仰视）
7. 局部细节特写（材质/纹理/工艺细节放大）
8. 使用场景图（物品在自然使用环境中）
9. 包装/品牌特写（包装或品牌标识特写）

【九宫格要求】
* 9 张子图之间必须具有明显视角差异
* 每张图独立拍摄感，但保持统一棚拍光线
* 6 个方向视图必须完整，缺一不可
* 细节/场景图要展示物品的不同信息维度

【统一要求】
* 所有子图必须保持同一物品的一致性
* 颜色、材质、品牌标识、尺寸比例严格一致
* 背景纯白干净（使用场景图除外）
* 光影与色调统一
* 不允许出现额外物品或多余元素
* 必须完整生成 6 个方向视图 + 3 个细节/场景图
```

#### 2.3 `qinghe-video/src/prompts/consistency_images_scene.md`
场景 2×2 四面环视图。

```markdown
主体描述：{subject}
风格偏好：{style_preference}

帮我生成图片：场景设定参考图，严格按照模板布局生成。
四面环视图，展示同一场景的四个基本方向。

场景必须与参考图保持一致：
* 相同建筑/地理元素
* 相同光照与时间段
* 相同天气与氛围
* 相同色彩基调

禁止动漫、插画、卡通、3D渲染风格。
保留真实摄影质感与自然光影。

【固定布局 - 2×2 四视图】
1. 左上：正面视图（北向视角，面向场景主视角）
2. 右上：背面视图（南向视角，与正面相对 180 度）
3. 左下：左侧视图（西向视角，正面左侧 90 度）
4. 右下：右侧视图（东向视角，正面右侧 90 度）

【四视图要求】
* 4 张子图必须是同一场景的四个方向
* 必须保持场景元素的连续性（如建筑、地平线、天空在相邻视角应能呼应）
* 时间段、天气、光照必须一致
* 4 个视角之间应能看出空间连续性，像站在同一点转身拍摄

【统一要求】
* 色彩基调与氛围统一
* 光影方向符合同一时间段的物理规律
* 不允许出现明显不属于该场景的元素
* 必须完整生成 4 个方向视图，缺一不可
* 每张子图独立构图，但保持摄影风格一致
```

### 三、后端：注册路由（修改 `src/main.py`）

在 `main.py:65` 之后新增一行：

```python
from src.consistency_images import consistency_images_router
app.include_router(consistency_images_router)
```

（import 放到文件顶部现有 import 区，`include_router` 调用放到 `main.py:65` 现有 `image_studio_router` 注册之后）

### 四、前端：常量与类型

#### 4.1 `frontend/src/lib/constants.ts`
- `WorkshopStepKey` 联合类型增加 `"consistency_images"`（`constants.ts:84`）
- `WORKSHOP_STEPS` 数组在 index 2（copywriter 之后）插入新步骤，原 scriptwriter..compose 的 num 全部 +1（`constants.ts:107-116`）：

```ts
{ key: "consistency_images", num: 3, title: "一致性生图", emoji: "🧬", kicker: "CONSISTENCY",
  desc: "人物/物品/场景参考图", gridSpan: 2,
  description: "生成人物设定集、物品九宫格、场景四面环视图，保证主体一致性",
  type: "image", deps: ["copywriter"], defaultAuto: false },
```

原各项 num 改为：scriptwriter=4, visual_designer=5, distributor=6, image_gen=7, tts=8, compose=9。

- `DEFAULT_AUTO_RUN_TO` 保持 `4`（即自动跑到「脚本」完成，不自动跑一致性生图——因它需要用户主动上传/输入）。**注意**：因 num 重新编号，4 仍指向 scriptwriter，语义不变。

#### 4.2 `frontend/src/types/api.ts`
新增类型：

```ts
export type ConsistencyImageType = "character" | "object" | "scene";
export type ConsistencyMode = "image_to_image" | "text_to_image";

export interface ConsistencyImageResponse {
  status: "success" | "error";
  image_type: ConsistencyImageType;
  image_url: string;
  prompt: string;
  consistency_mode: ConsistencyMode;
  subject: string;
  error?: string;
}

export interface ConsistencyImageSlot {
  url: string;
  prompt: string;
  mode: ConsistencyMode;
  status: "loading" | "done" | "error";
  error?: string;
}
```

### 五、前端：Store 扩展（`frontend/src/stores/workshop-store.ts`）

- `WorkshopMediaResults` 增加三字段（`workshop-store.ts:25-30`）：

```ts
export interface WorkshopMediaResults {
  images: WorkshopImage[];
  audioUrl: string | null;
  audioPath: string | null;
  videoUrl: string | null;
  characterImage: ConsistencyImageSlot | null;  // 新
  objectImage: ConsistencyImageSlot | null;     // 新
  sceneImage: ConsistencyImageSlot | null;      // 新
}
```

- `DEFAULT_MEDIA` 同步加 `characterImage: null, objectImage: null, sceneImage: null`
- 新增 action：`setConsistencyImage(type, slot)` 单独写某一类结果（避免 `setMediaResults` 浅合并嵌套对象覆盖问题）
- `persist` / `hydrate` 快照自动包含新字段（因 sessionStorage 序列化整个 store state）
- 注释里的「8 步」改为「9 步」（`workshop-store.ts:11`）

### 六、前端：新增 Hook（`frontend/src/hooks/use-media.ts`）

仿 `useImageStudioGenerate`（`use-media.ts:22`），multipart 用独立 fetch + `getAuthToken()`：

```ts
export function useConsistencyImageGenerate() {
  return useMutation({
    mutationFn: async (params: {
      imageType: ConsistencyImageType;
      subject: string;
      stylePreference?: string;
      size?: string;
      negativePrompt?: string;
      referenceImage?: File | null;
    }) => {
      const fd = new FormData();
      fd.append("image_type", params.imageType);
      fd.append("subject", params.subject);
      if (params.stylePreference) fd.append("style_preference", params.stylePreference);
      if (params.size) fd.append("size", params.size);
      if (params.negativePrompt) fd.append("negative_prompt", params.negativePrompt);
      if (params.referenceImage) fd.append("reference_image", params.referenceImage);

      const token = getAuthToken();
      const resp = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || ""}/api/consistency-images/generate`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,  // 不设 Content-Type，浏览器自动带 boundary
        }
      );
      if (!resp.ok) throw new Error((await resp.json()).detail || resp.statusText);
      return (await resp.json()) as ConsistencyImageResponse;
    },
  });
}
```

### 七、前端：工坊页面执行流（`frontend/src/pages/WorkshopPage.tsx`）

在 `executeStep` 的 switch（`WorkshopPage.tsx:126` 附近）新增分支：

```ts
case "consistency_images": {
  await execConsistencyImages(key);
  return;
}
```

新增 `execConsistencyImages` 函数（仿 `execImageGen` `WorkshopPage.tsx:192`）：
- 从 `workshopState.copywriter_output` 尝试预填主体描述（可选，若用户已填则不覆盖）
- 读取 `mediaResults` 中三类各自的状态，仅跑用户勾选/未完成的类（MVP：默认三类全跑，已有 done 的跳过）
- 用 `Promise.allSettled` 并发调 `useConsistencyImageGenerate`，逐类写回 `setConsistencyImage(type, slot)`
- 至少一类 fulfilled → `setStepStatus(key, "done")`；全部 rejected → `setStepStatus(key, "error")`

### 八、前端：步骤内容渲染（`frontend/src/components/workshop/`）

#### 8.1 新建 `ConsistencyImagesPanel.tsx`
3 个子卡片（人物/物品/场景），每个子卡片含：
- 主体描述 `<textarea>`（默认从 copywriter_output 推断，可编辑）
- 风格偏好 `<input>`（可选）
- 拖拽上传参考图区（仿 `ImageStudioPage.tsx:58-91`，10MB 限制，image/* 校验，`URL.createObjectURL` 预览）
- 「生成」按钮（独立调用 hook）
- 结果图预览（`<img>` + 下载链接）+ 一致性模式徽章（图生图/文生图）
- 子状态徽章（pending/running/done/error）

#### 8.2 修改 `WorkshopStepDetail.tsx`
在 `WorkshopStepContent`（`WorkshopStepDetail.tsx:24`）的 switch 加：

```tsx
case "consistency_images":
  return <ConsistencyImagesPanel step={step} />;
```

### 九、前端：进度条与卡片（自动适配）

- `WorkshopProgressBar.tsx` 从 `WORKSHOP_STEPS` 动态渲染，自动显示 9 个节点，无需手动改
- `WorkshopStepCard.tsx` 从 `cfg.num` 取序号，自动适配新编号
- `WorkshopStepList.tsx` 网格自动重新流式排布

---

## Verification Steps

### 后端验证

1. **启动**：`cd qinghe-video && uvicorn src.main:app --port 18739 --reload`，无 import 错误
2. **健康检查**：`GET /api/consistency-images/health`（带 token）→ 200 `{"status":"ok","module":"consistency-images"}`
3. **鉴权**：不带 token 调 `POST /api/consistency-images/generate` → 401
4. **参数校验**：
   - `image_type=foo` → 400
   - `subject=""` → 400
   - 上传非图片 MIME → 400
5. **纯文生图**：不传 `reference_image`，`image_type=character` + `subject="测试"` → 200，返回 `image_url` 指向 `/outputs/image/consistency_character_*.jpg`，`consistency_mode="text_to_image"`，文件实际存在
6. **图生图**：传 `reference_image`（jpg）→ 200，`consistency_mode="image_to_image"`
7. **三类模板**：分别用 character/object/scene 各调一次，确认返回的 `prompt` 字段包含对应布局描述
8. **现有测试**：`pytest tests/ -v` 全部通过（不应破坏现有 test_graph / test_auth）

### 前端验证

1. **启动**：`cd qinghe-video/frontend && npm run dev`，无 TS 编译错误
2. **lint**：`npm run lint` 无新增告警
3. **工坊步骤数**：进入 `/workshop`，进度条显示 **9 个节点**，第 3 步标题为「一致性生图 🧬」
4. **步骤内容**：点击第 3 步卡片，显示 3 个子卡片（人物/物品/场景），每个含主体输入、风格输入、参考图上传区、生成按钮
5. **执行流程**：
   - 在「人物」子卡片填主体描述 + 上传参考图 + 点生成 → 显示 loading → 显示结果图，徽章为「图生图」
   - 在「物品」子卡片填主体描述（不上传参考图）+ 点生成 → 徽章为「文生图」
6. **状态持久化**：刷新页面，第 3 步结果仍在（sessionStorage 恢复）
7. **后续步骤**：第 4 步「脚本」仍可正常运行（依赖 copywriter，不受新步骤影响）
8. **自动执行**：从第 1 步点「自动运行」，跑到第 4 步（脚本）停止，不会卡在第 3 步（因 `defaultAuto: false`，自动流跳过该步）

---

## 后续增强（不在本次范围）

- **image_gen 接入一致性参考**：让第 7 步「出图」可选使用第 3 步产出的人物/物品/场景图作为逐镜图生图的参考图（需扩展 `image_generation.py` 支持 `image` 字段，或改用 `image_variants._generate_single`）
- **LLM 智能扩写主体描述**：用户输入简短主体（如「苹果」），LLM 扩写为完整生图描述（如「新鲜红苹果，带水珠，完整果柄，红色饱满」）
- **重试与单图重生成**：子卡片支持单独重试某张失败的图
- **下载与导出**：支持打包下载三类一致性图
