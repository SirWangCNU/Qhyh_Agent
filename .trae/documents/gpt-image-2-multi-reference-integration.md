# gpt-image-2 多参考图生图接入报告与实施计划

## Summary（摘要）

当前 gpt-image-2 路径在多参考图生图上存在**三个核心缺陷**导致功能不可用：
1. **致命断点**：本地 `/outputs/` 相对 URL 直接传给远程网关，网关无法访问本地文件
2. **类型标签丢失**：人物/物品/场景三类参考图被合并成无标签扁平数组，API 无法区分
3. **prompt 缺失参考图说明**：不拼接任何"图1=人物参考"的文字提示，模型不知道每张图该参考什么

本计划基于 OpenAI 官方 Cookbook 与市面主流做法，对 gpt-image-2 路径做**针对性修复与增强**，使其真正支持多参考图生图。doubao-seedream 路径已能工作，**不动**。

---

## Current State Analysis（现状分析）

### 链路全景

```
前端 useCanvasStoryboard.generateSegment
  ↓ contentRefs[0/1/2] → character_ref/object_ref/scene_ref（位置硬映射）
后端 storyboard_service._generate_single_segment
  ↓ _resolve_segment_references 合并去重 → content_refs（无标签扁平数组）
  ↓ prompt = STORYBOARD_BOARD_PROMPT + storyboard_text（无参考图说明）
后端 image_generation._generate_with_references_gpt
  ↓ 筛选 /outputs/ 开头的 URL（致命断点：网关访问不到）
  ↓ final_prompt = prompt（无任何参考图文字注入）
  ↓ payload["image"] = ref_urls（URL 字符串列表，非 base64）
远程网关 api.xgapi.top
  ✗ 无法访问本地 /outputs/ 路径 → 生图失败
```

### 关键代码位置

| 问题 | 文件:行号 | 现状 |
|---|---|---|
| 本地 URL 断点 | `src/image_generation.py:437` | `if ref_url.startswith("/outputs/"): ref_urls.append(ref_url)` 直接传相对路径 |
| 类型标签丢失 | `src/canvas/storyboard_service.py:380` | `raw = [character_ref, object_ref, scene_ref]` 合并去重成扁平 list |
| prompt 无参考图说明 | `src/image_generation.py:440-445` | 只对 style_refs/structure_refs 拼文字，content_refs 不拼 |
| 前端位置硬映射 | `useCanvasStoryboard.ts:579-581` | `refUrls[0]→character_ref, [1]→object_ref, [2]→scene_ref` |

### 对比：doubao-seedream 路径为什么能工作

`src/image_generation.py:304-324`（seedream 分支）：
- 把 `/outputs/` 本地文件**读出来转成 base64 data URI**（`data:image/jpeg;base64,...`）
- prompt 拼接 `请参考@图1、@图2的内容保持人物、物体、场景一致`
- 网关 agaigw.com 接受 base64 data URI，无需访问本地文件

gpt-image-2 路径**两件事都没做**，所以失败。

---

## 主流做法调研结论

### 1. 多图引用约定（OpenAI Cookbook + 社区共识）

**核心原则：给每张参考图"分配任务"**。模型不会自动知道每张图该参考什么，必须在 prompt 中明确说明。

主流模板（来自腾讯云开发者社区、OpenAI Cookbook）：
```
请综合我上传的所有参考图片来生成一张新图：
1. 第 1 张图主要参考：[人物的脸部特征、五官比例、发型、肤色等]
2. 第 2 张图主要参考：[物品外观、形状、颜色、材质等]
3. 第 3 张图主要参考：[场景环境、构图、光线氛围]
生成一张：[最终画面简述]
要求：
- 保持主体身份一致，以第 1 张图为主
- 物品外观尽量接近第 2 张图
- 场景和光线请尽量贴近第 3 张图
```

OpenAI 官方 Cookbook 建议："通过索引和描述引用每个输入（图像1:产品照片...图像2:样式参考...），并描述它们如何交互"。

### 2. 图片传输方式

- gpt-image-2 的 `image` 参数**同时支持 URL 和 base64**
- 文档示例用公网 URL（`https://filesystem.site/cdn/...jpg`），但本地部署场景下 **base64 data URI 是唯一可行方案**
- 单图建议 ≤1.5MB（WebP/JPG 压缩），避免 413 错误；1-4 张为宜

### 3. 提示词结构

OpenAI 推荐：Scene → Subject → Detail → Use case → Constraint。参考图说明应放在 prompt **开头**（前 30% token 权重最高）。

---

## Proposed Changes（改动方案）

### 决策

1. **图片传输**：gpt-image-2 路径改为 **base64 data URI**（复用 seedream 路径已有的本地文件读取逻辑）。不动 URL 直传能力（未来若有公网图床可切换）。
2. **类型标签**：在 `_generate_with_references_gpt` 中按 `content_refs` 顺序注入"图1=人物参考、图2=物品参考、图3=场景参考"的文字说明到 prompt 开头。
3. **顺序保序**：全链路保持 character → object → scene 顺序，不在 `_resolve_segment_references` 中去重打乱（去重保留，但顺序固定）。
4. **聚焦 gpt-image-2**：doubao-seedream 路径已能工作，不动。

### 文件 1：`src/image_generation.py` — 核心修复

**位置**：`_generate_with_references_gpt` 函数（行 426-467）

**改动 1.1：本地 URL → base64 data URI**

新增辅助函数 `_local_url_to_data_uri(url)`，复用 seedream 路径已有的本地文件读取逻辑：
```python
def _local_url_to_data_uri(url: str) -> str | None:
    """把 /outputs/xxx 本地相对 URL 转成 base64 data URI。
    远程网关无法访问本地文件，必须转成 data URI。
    返回 None 表示转换失败（文件不存在等）。
    """
    if not url.startswith("/outputs/"):
        return None  # 非本地路径，原样返回由调用方处理
    # 复用 seedream 路径的 OUTPUTS_DIR 解析逻辑
    file_path = OUTPUTS_DIR / url.replace("/outputs/", "", 1)
    if not file_path.exists():
        return None
    import base64, mimetypes
    mime = mimetypes.guess_type(str(file_path))[0] or "image/jpeg"
    with open(file_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    return f"data:{mime};base64,{b64}"
```

**改动 1.2：prompt 注入参考图类型说明**

在 `_generate_with_references_gpt` 中，按 content_refs 顺序拼接参考图说明：
```python
# 参考图类型标签（按顺序对应 character/object/scene）
REF_TYPE_LABELS = ["人物参考", "物品参考", "场景参考"]

ref_notes: list[str] = []
for i, ref_url in enumerate(content_refs or []):
    label = REF_TYPE_LABELS[i] if i < len(REF_TYPE_LABELS) else f"补充参考{i+1}"
    ref_notes.append(f"第{i+1}张图为{label}，请保持该图中的{'脸部特征与身份' if label=='人物参考' else '物品外观与材质' if label=='物品参考' else '场景环境与氛围'}一致")

if ref_notes:
    ref_block = "请综合以下参考图片生成新图：\n" + "\n".join(ref_notes)
    ref_block += "\n生成一张："
    final_prompt = f"{ref_block}\n{prompt}"
else:
    final_prompt = prompt
```

**改动 1.3：image 字段传 data URI**

```python
image_payload: list[str] = []
for ref_url in (content_refs or []) + (style_refs or []) + (structure_refs or []):
    if not ref_url:
        continue
    if ref_url.startswith("/outputs/"):
        data_uri = _local_url_to_data_uri(ref_url)
        if data_uri:
            image_payload.append(data_uri)
    elif ref_url.startswith("http"):
        image_payload.append(ref_url)  # 公网 URL 直传
    # 其他情况跳过
```

### 文件 2：`src/canvas/storyboard_service.py` — 顺序保序

**位置**：`_resolve_segment_references`（行 369-385）

**现状**：已按 `[character_ref, object_ref, scene_ref]` 顺序去重，顺序正确。**无需改动**，但需确认调用方依赖顺序。

**确认**：`_generate_single_segment`（行 413）调用后传给 `generate_with_references(content_refs=...)`，顺序会被 `_generate_with_references_gpt` 的 `REF_TYPE_LABELS` 按下标消费。顺序链路完整，无需改动此文件。

### 文件 3：`src/image_generation.py` — size 参数适配（可选小修）

**位置**：`_generate_with_references_gpt`（行 451）

**现状**：`size=size or settings.IMAGE_SIZE`，默认 `1920x1920`。但 gpt-image-2 文档示例用 `1024x1024`，且要求"两边都是 16 的倍数"。`1920x1920` 符合要求，但 xgapi.top 网关是否支持需实测。

**改动**：保持 `1920x1920` 默认，若实测失败再降级到 `1024x1024`。不预先改动。

---

## Assumptions & Decisions（假设与决策）

### 假设
1. xgapi.top 网关的 gpt-image-2 接口接受 base64 data URI 作为 `image` 数组元素（OpenAI 官方 SDK 行为，中转站通常兼容）
2. `OUTPUTS_DIR` 常量在 `image_generation.py` 中已定义（seedream 路径在用）
3. 参考图顺序在 `_resolve_segment_references` 去重后保持 `[character, object, scene]`（现状如此）

### 决策
1. **base64 而非公网上传**：项目本地部署无公网图床，base64 是唯一可行方案。请求体变大（3 张图 × ~1.5MB base64 ≈ 6MB），但 gpt-image-2 网关支持。
2. **类型标签按位置映射**：`content_refs[0]→人物, [1]→物品, [2]→场景`，与前端 `refUrls[0/1/2]→character/object/scene_ref` 位置映射一致。这与现有 `loadFromWorkshop` 创建参考图节点的固定顺序吻合。
3. **prompt 开头注入参考图说明**：遵循 OpenAI Cookbook"前 30% token 权重最高"原则，参考图说明放在 prompt 最前面。
4. **不动 seedream 路径**：已能工作，避免回归风险。

---

## Verification Steps（验证步骤）

### 1. 单元测试
- 新增 `tests/test_image_generation.py::test_local_url_to_data_uri`：验证本地 URL 转 base64 data URI
- 新增 `tests/test_image_generation.py::test_gpt_prompt_includes_ref_notes`：验证 prompt 包含"第1张图为人物参考"等说明

### 2. 集成验证（需 API key）
```bash
cd qinghe-video
py -c "
import asyncio
from src.image_generation import generate_with_references
async def test():
    result = await generate_with_references(
        prompt='一碗米饭特写镜头，电影级布光',
        content_refs=['/outputs/image/canvas_xxx.jpg'],  # 替换为实际存在的图
        style_refs=None, structure_refs=None,
        size='1920x1920', n=1, model='gpt-image-2',
    )
    print('Success:', result)
asyncio.run(test())
"
```

### 3. 前端画布验证
- 画布上连 3 张参考图节点（人物/物品/场景）到段节点
- 段节点模型选 gpt-image-2
- 点击生成，确认成功返回图片 URL

### 4. TypeScript 验证
```bash
cd qinghe-video/frontend && npx tsc --noEmit
```

### 5. 后端测试
```bash
cd qinghe-video && pytest tests/ -v
```

---

## 实施任务清单

- [ ] **Task 1**：`src/image_generation.py` 新增 `_local_url_to_data_uri` 辅助函数
- [ ] **Task 2**：`src/image_generation.py` 修改 `_generate_with_references_gpt`：
  - 本地 URL 转 base64 data URI
  - prompt 开头注入参考图类型说明（人物/物品/场景）
- [ ] **Task 3**：新增单元测试（data URI 转换 + prompt 注入）
- [ ] **Task 4**：集成验证（直接调用 gpt-image-2 路径 + 画布端到端）
- [ ] **Task 5**：`npx tsc --noEmit` + `pytest tests/ -v` 全绿
