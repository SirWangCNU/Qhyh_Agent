# 工坊脚本分段 + 故事板文本生成计划（Phase 1）

## 摘要

把工坊的 `scriptwriter` 步骤从「单段 ≤60s 平铺 shots」改造为「N 个 ≤15s 片段，每段附带 04b 格式故事板文本」。本次只做**故事板文本生成**，每个片段的生图与视频合成留待 Phase 2（用户已确认「先不用着重这个」）。

核心思路：`scriptwriter` 节点内部由「1 次 LLM 调用」改为「1 + N 次」——
1. **Call 1（结构化）**：用改造后的 `scriptwriter.txt` 产出 `segments[]`（每段 ≤15s，含该段 shots），同时保留平铺 `shots` 字段以向后兼容 `visual_designer` / `video_mvp` / 画布导出。
2. **Call 2..N+1（纯文本）**：对每个 segment，用新增的 `04b_storyboard_board.md` 系统提示词 + 该段 shots 作为输入，产出该段的 `storyboard_text`（04b 导演级镜头蓝图文本）。

04b 提示词明确「只生成一个连续片段」「禁止把长剧本完整展开成多段剧情」，因此按段独立调用最贴合其设计。「同时写入」的语义在 Phase 1 体现为：一个 `scriptwriter` 步骤内完成全部 N 段故事板文本（循环调用），对外仍是单步。

## 当前状态分析

### 已有机制（保留 / 复用）
- **`scriptwriter.py`**：`SYSTEM_PROMPT = get_system_prompt("scriptwriter")` 模块级加载；`scriptwriter_node(state)` 构建 `ChatPromptTemplate`，调 `invoke_structured_llm(llm, prompt, ScriptwriterOutput, vars)` → `ScriptwriterOutput`，返回 `{"scriptwriter_output": result.model_dump()}`。失败写 `{"error": ...}`。
- **`models.py`**：`ScriptwriterOutput { title, total_duration_seconds, bgm_suggestion, shots: list[Shot], production_notes }`，`ConfigDict(extra="forbid")`。`Shot { shot_id:int, start_time, end_time, duration_seconds:int, shot_type, camera_movement, visual_description, voiceover, text_overlay?, sound_effects?, transition }`。
- **`agent_steps.py`**：`scriptwriter` → `scriptwriter_node`，输出键 `scriptwriter_output`。`AgentStepRequest { input, state, selected_topic }`。
- **`visual_designer.py`**：读 `scriptwriter_output.shots`，按 `shot_id` 1:1 产 `shot_prompts`。**依赖 `shots` 字段**。
- **`video_mvp.py`**：读 `visual_output.shot_prompts`（不直接读 scriptwriter），每图统一 3.5s。本次不动。
- **前端 `AgentOutputView.tsx:115-169` `ScriptwriterView`**：表格渲染 `output.shots`。
- **前端 `WorkshopPage.tsx:318-349` `buildStoryboardPayload`**：读 `sw.shots` 构造画布导出。
- **前端 `types/api.ts:226-232`**：`ScriptwriterOutput { title, total_duration_seconds, bgm_suggestion, shots: Shot[], production_notes }`。
- **`workshop-store.ts`**：以 `workshopState: GenerateResult` 透传存储完整状态，不感知 schema 细节。

### 缺口（本计划解决）
1. `ScriptwriterOutput` 无 `segments` 概念，无法表达 ≤15s 分段。
2. 无 04b 故事板文本生成能力。
3. 前端无分段 + 故事板文本展示。

### 不动项（Phase 2+）
- 每段生图（用户已有相关提示词，本次不接入）。
- 每段视频合成 / N 个独立 mp4 拼接。
- `video_mvp.py` / `video_compose.py` / `canvas/storyboard_service.py`。
- `visual_designer.py`（继续读平铺 `shots`，行为不变）。

## 设计决策

| 决策项 | 选择 | 理由 |
|---|---|---|
| 步骤位置 | 改造 `scriptwriter` 节点本身（不新增 workshop 步骤） | 用户已选；对外仍是单步，工坊 4 步流水线不变 |
| 调用次数 | 1 + N 次 LLM 调用（Call 1 结构化产 segments；Call 2..N+1 按段产 storyboard_text） | 04b 提示词设计为「单段输入→单段蓝图」，按段独立调用最可靠；避免单次调用输出过长 + JSON 内嵌大段文本的转义风险 |
| `shots` 字段 | 保留为平铺视图（= `segments[].shots` 拼接），由节点在 Call 1 后填充 | 向后兼容 `visual_designer` / `video_mvp` / 画布导出 / 现有测试；LLM 只需产 `segments` |
| `storyboard_text` 类型 | `str`（04b 格式纯文本，多行） | 04b 输出本就是结构化文本块（S01/S02/STATE CHAIN/END BEAT…），作为整段字符串保存最忠实 |
| 04b 提示词文件 | 新建 `prompts/04b_storyboard_board.md`，节点内 `get_system_prompt("04b_storyboard_board")` 加载 | 与 `image_studio_director_board.md` 一致；模块级加载（AGENTS.md 已知 quirk，改 prompt 需重启） |
| 段数推导 | 由 LLM 在 Call 1 根据 `total_duration_seconds` 自行分段（≤15s/段） | `target_duration` 是自由文本（"30-60秒"），硬编码切分不靠谱；LLM 按剧情因果切分更优 |
| `storyboard_text` 默认值 | `""`（Call 1 不产，Call 2 填充） | 让 Call 1 结构化输出更轻；缺失时前端降级显示 |
| Phase 1 范围 | 仅文本生成；生图/视频留待 Phase 2 | 用户明确「先不用着重这个」 |

## 提议改动

### A. 后端：新增 04b 故事板提示词

#### A1. 新建 `qinghe-video/src/prompts/04b_storyboard_board.md`
- 内容 = 用户提供的 04b 故事板系统提示词（Role / Global Duration Lock ≤15s / Director Rule / Shot Construction Rule / Causal Chain Rule / Spatial Continuity Rule / Character/Object/Dialogue/Sound/Transition/Duration Rule / Output Format / Hard Negative Rules）。
- 唯一调整：在文件顶部追加一段「输入约定」说明——
  > 你会收到一段已经写好的分镜脚本（JSON，含该段 shots 数组、场景信息）。你的任务是把这一段 ≤15s 的镜头转换为导演级 Storyboard Text，严格遵守下方规则。不要改写镜头内容，只做导演蓝图转译。
- 不含 `{` / `}` 模板变量（04b 原文无花括号），`get_system_prompt` 的 `{{ }}` 转义不会破坏它。

### B. 后端：扩展 Pydantic 模型

#### B1. 修改 `qinghe-video/src/models.py`
在 `Shot` 之后、`ScriptwriterOutput` 之前新增：

```python
class StorySegment(BaseModel):
    """单个 ≤15s 故事板片段。"""

    model_config = ConfigDict(extra="forbid")

    segment_id: int = Field(..., description="片段序号，从 1 开始")
    start_time: str = Field(..., description="该片段起始时间，如 00:00")
    end_time: str = Field(..., description="该片段结束时间，如 00:15")
    duration_seconds: float = Field(..., description="该片段时长，必须 ≤ 15.0")
    shots: list[Shot] = Field(..., description="该片段内的镜头列表")
    storyboard_text: str = Field(
        default="", description="04b 格式故事板文本（由二次 LLM 调用填充）"
    )
```

修改 `ScriptwriterOutput`：

```python
class ScriptwriterOutput(BaseModel):
    """脚本 Agent 输出。"""

    model_config = ConfigDict(extra="forbid")

    title: str
    total_duration_seconds: int
    bgm_suggestion: BgmSuggestion
    segments: list[StorySegment] = Field(..., description="≤15s 故事板片段列表")
    shots: list[Shot] = Field(
        default_factory=list,
        description="所有片段镜头的平铺视图（由节点从 segments 拼接，向后兼容 visual_designer/video_mvp）",
    )
    production_notes: str
```

**关键点**：
- `segments` 必填（新核心结构）。
- `shots` 改为可选（`default_factory=list`），由节点在 Call 1 后从 `segments` 平铺填充，LLM 无需产 `shots`。
- `extra="forbid"` 保持不变；`with_structured_output` 会把 `shots`（有默认）视为可选，LLM 可省略。

### C. 后端：改造 scriptwriter 节点

#### C1. 修改 `qinghe-video/src/nodes/scriptwriter.py`
整体结构改为「1 + N 调用」。新文件 < 500 行（预估 ~150 行）。

```python
"""脚本 Agent 节点。

将口播文案转化为可执行的分镜脚本，并按 ≤15s 切分为多个故事板片段，
每段附 04b 格式导演级 Storyboard Text。
"""

from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from pydantic import ValidationError

from src.config import get_system_prompt
from src.models import ScriptwriterOutput, StorySegment
from src.nodes.llm import get_llm
from src.utils.json_parser import invoke_structured_llm

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = get_system_prompt("scriptwriter")
STORYBOARD_PROMPT = get_system_prompt("04b_storyboard_board")  # 新增

# 单段故事板文本调用的温度（导演创作略高）
_STORYBOARD_TEMPERATURE = 0.6


def scriptwriter_node(state: dict[str, Any]) -> dict[str, Any]:
    """脚本节点：生成 ≤15s 分段脚本 + 每段故事板文本。"""
    logger.info("[Scriptwriter] 开始生成分段分镜脚本")
    try:
        planner_output = state.get("planner_output", {})
        copywriter_output = state.get("copywriter_output", {})

        llm = get_llm(temperature=0.7)

        # ── Call 1：结构化产出 segments（每段 ≤15s，含 shots）──
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", SYSTEM_PROMPT),
                (
                    "human",
                    "请根据以下策划与文案生成分镜脚本，并按 ≤15s 切分为多个片段。\n\n"
                    "【产品信息】\n"
                    "产品：{product_name}，产地：{origin}，目标平台：{target_platform}，目标时长：{target_duration}\n\n"
                    "【策划方案】\n{planner_output}\n\n"
                    "【口播文案】\n{copywriter_output}",
                ),
            ]
        )

        result: ScriptwriterOutput = invoke_structured_llm(
            llm,
            prompt,
            ScriptwriterOutput,
            {
                "product_name": state.get("product_name", ""),
                "origin": state.get("origin", ""),
                "target_platform": state.get("target_platform", "抖音"),
                "target_duration": state.get("target_duration", "30-60秒"),
                "planner_output": json.dumps(planner_output, ensure_ascii=False, indent=2),
                "copywriter_output": json.dumps(copywriter_output, ensure_ascii=False, indent=2),
            },
        )

        # ── 平铺 shots（向后兼容 visual_designer / video_mvp / 画布导出）──
        flat_shots: list[dict[str, Any]] = []
        for seg in result.segments:
            for s in seg.shots:
                flat_shots.append(s.model_dump())

        # ── Call 2..N+1：每段调 04b 提示词产 storyboard_text ──
        sb_llm = get_llm(temperature=_STORYBOARD_TEMPERATURE)
        for seg in result.segments:
            seg.storyboard_text = _generate_storyboard_text(sb_llm, seg)

        data = result.model_dump()
        data["shots"] = flat_shots

        logger.info(
            "[Scriptwriter] 完成：片段数=%d，总镜数=%d，总时长=%ds",
            len(result.segments),
            len(flat_shots),
            result.total_duration_seconds,
        )
        return {"scriptwriter_output": data}
    except ValidationError as e:
        logger.exception("[Scriptwriter] 输出校验失败")
        return {"error": f"脚本 Agent 输出格式错误: {e}"}
    except Exception as e:
        logger.exception("[Scriptwriter] 节点执行失败")
        return {"error": f"脚本 Agent 执行失败: {e}"}


def _generate_storyboard_text(llm, segment: StorySegment) -> str:
    """对单个 ≤15s 片段调用 04b 提示词，返回 Storyboard Text。

    失败时返回空字符串并记日志，不阻断整体流程（storyboard_text 为非关键字段）。
    """
    sb_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", STORYBOARD_PROMPT),
            (
                "human",
                "请把以下分镜片段转换为导演级 Storyboard Text（≤15s，严格遵守 04b 规则）。\n\n"
                "【片段信息】\n"
                "segment_id: {segment_id}\n"
                "时长: {start_time}-{end_time}（{duration}s）\n\n"
                "【该段镜头】\n{shots_json}",
            ),
        ]
    )
    try:
        chain = sb_prompt | llm
        resp = chain.invoke(
            {
                "segment_id": segment.segment_id,
                "start_time": segment.start_time,
                "end_time": segment.end_time,
                "duration": segment.duration_seconds,
                "shots_json": json.dumps(
                    [s.model_dump() for s in segment.shots], ensure_ascii=False, indent=2
                ),
            }
        )
        # llm.invoke 返回 AIMessage，取 .content
        content = getattr(resp, "content", str(resp))
        if not isinstance(content, str):
            content = str(content)
        logger.info(
            "[Scriptwriter] 片段 %d 故事板文本生成完成，长度=%d",
            segment.segment_id,
            len(content),
        )
        return content.strip()
    except Exception as e:
        logger.exception("[Scriptwriter] 片段 %d 故事板文本生成失败", segment.segment_id)
        return ""
```

**关键点**：
- `STORYBOARD_PROMPT` 模块级加载（与 `SYSTEM_PROMPT` 一致，遵循 AGENTS.md quirk）。
- Call 2..N+1 失败时返回 `""`，不抛异常 —— `storyboard_text` 是非关键字段，空值时前端降级显示。
- `shots` 平铺在节点内完成，LLM 无需产 `shots`，避免冗余/不一致。
- `get_llm` 在 `scriptwriter_node` 内调用两次（不同温度）—— 不在模块级，避免 import 时副作用。

#### C2. 修改 `qinghe-video/src/prompts/scriptwriter.txt`
把输出格式从单层 `shots[]` 改为 `segments[]`（每段内嵌 `shots[]`），并加分段约束。新内容：

```
# 角色：短视频分镜脚本专家

你是「青禾映画」平台的脚本 Agent，负责将文案转化为可执行的分镜脚本，并按 ≤15s 切分为多个故事板片段。

## 你的职责
1. 将口播文案拆解为多个镜头（shot）
2. 按时长把镜头分组为多个「片段（segment）」，每个片段 ≤ 15 秒
3. 为每个镜头定义：画面内容、镜头运动、时长、同期声/音效
4. 设计视觉节奏：哪里用特写、哪里用航拍、哪里用字幕强调
5. 建议 BGM 风格和节奏

## 输入格式
你会收到策划 Agent 的输出 + 文案 Agent 的输出。

## 输出格式

{
  "title": "视频标题",
  "total_duration_seconds": 45,
  "bgm_suggestion": {
    "style": "如：轻快民谣 / 温暖钢琴 / 动感电子",
    "bpm_range": "如 100-120",
    "mood": "如 温暖治愈",
    "reference": "参考曲目或风格描述"
  },
  "segments": [
    {
      "segment_id": 1,
      "start_time": "00:00",
      "end_time": "00:15",
      "duration_seconds": 15,
      "shots": [
        {
          "shot_id": 1,
          "start_time": "00:00",
          "end_time": "00:03",
          "duration_seconds": 3,
          "shot_type": "特写/中景/远景/航拍/跟拍/第一人称",
          "camera_movement": "固定/缓推/快摇/跟拍/升降",
          "visual_description": "画面内容的详细描述（中文，供后续生成视觉 prompt 使用）",
          "voiceover": "对应口播文案（如该镜头无口播则为空）",
          "text_overlay": "屏幕文字/字幕（可选）",
          "sound_effects": "音效描述（可选）",
          "transition": "转场方式（硬切/淡入淡出/滑动等）"
        }
      ]
    }
  ],
  "production_notes": "拍摄/制作注意事项"
}

## 约束
- 每个镜头时长 2-8 秒
- **每个 segment 的 duration_seconds 必须 ≤ 15**
- 段与段之间时间连续：segment 2 的 start_time = segment 1 的 end_time
- segment 内镜头时间连续递增
- 第一个镜头必须是 Hook 对应的画面（强吸引力）
- 镜头类型多样化，避免连续 3 个相同景别
- visual_description 要足够具体，能直接作为 AI 生图 prompt 的输入参考
- 考虑农户实际拍摄条件：大部分镜头可用手机完成，不要设计过于复杂的运镜
- 总时长与目标时长一致；若目标时长超过 15 秒，必须切分为多个 segment
- 用中文输出
- storyboard_text 字段留空字符串 ""，由后续流程填充，你不需要生成
```

**关键点**：明确告诉 LLM `storyboard_text` 留空（由 Call 2 填充），避免 Call 1 浪费 token 产文本。

### D. 前端：类型 + 展示

#### D1. 修改 `qinghe-video/frontend/src/types/api.ts`
在 `Shot` 接口之后新增 `StorySegment`，并扩展 `ScriptwriterOutput`：

```ts
export interface StorySegment {
  segment_id: number;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  shots: Shot[];
  storyboard_text: string;
}

export interface ScriptwriterOutput {
  title: string;
  total_duration_seconds: number;
  bgm_suggestion: BgmSuggestion;
  segments?: StorySegment[]; // 新增；旧会话可能缺失
  shots: Shot[]; // 保留（向后兼容 + 平铺视图）
  production_notes: string;
}
```

`segments` 设为可选（`?`）以兼容已存的旧会话快照（无 segments 字段）。

#### D2. 修改 `qinghe-video/frontend/src/components/agent/AgentOutputView.tsx`
改造 `ScriptwriterView`（行 115-169）：
- 顶部摘要：总时长 / **片段数**（新增）/ 分镜数。
- 主体改为「分段卡片」渲染：
  - 若 `output.segments?.length` 存在 → 渲染分段卡片列表，每段一个可折叠区块：
    - 段头：`片段 {segment_id} · {start_time}-{end_time} · {duration_seconds}s · {shots.length} 镜`
    - 段内 shots 表格（复用现有表格结构）
    - `storyboard_text` 区块：若非空，用 `<pre className="whitespace-pre-wrap text-xs">` 渲染（保留 04b 多行格式）；若空，显示「故事板文本生成中/失败」占位。
  - 若 `segments` 缺失（旧会话）→ 回退到现有平铺 shots 表格（保持现状）。
- `production_notes` 不变。

预估新增 ~60 行，整文件仍 < 500 行。

#### D3. 不动的文件
- `WorkshopPage.tsx`：`buildStoryboardPayload` 读 `sw.shots`，shots 保留 → 不变。
- `workshop-store.ts`：透传 `workshopState` → 不变。
- `useCanvasStoryboard.ts`：读 payload.shots → 不变。

### E. 测试

#### E1. 修改 `qinghe-video/tests/test_graph.py`
现有测试不动（`{"scriptwriter_output": {"shots": []}}` 仍合法，`shots` 是可选字段）。新增：

```python
def test_story_segment_model_forbids_extra():
    """StorySegment 拒绝多余字段。"""
    from src.models import StorySegment
    from pydantic import ValidationError
    valid = {
        "segment_id": 1, "start_time": "00:00", "end_time": "00:15",
        "duration_seconds": 15.0, "shots": [], "storyboard_text": "",
    }
    assert StorySegment(**valid)
    with pytest.raises(ValidationError):
        StorySegment(**{**valid, "extra_field": "bad"})


def test_scriptwriter_output_segments_required_shots_optional():
    """ScriptwriterOutput 必须有 segments，shots 可缺省。"""
    from src.models import ScriptwriterOutput
    # 缺 shots 合法
    s = ScriptwriterOutput(
        title="t", total_duration_seconds=15,
        bgm_suggestion={"style": "s", "bpm_range": "b", "mood": "m", "reference": "r"},
        segments=[], production_notes="n",
    )
    assert s.shots == []
    # 缺 segments 非法
    with pytest.raises(Exception):
        ScriptwriterOutput(
            title="t", total_duration_seconds=15,
            bgm_suggestion={"style": "s", "bpm_range": "b", "mood": "m", "reference": "r"},
            production_notes="n",
        )
```

#### E2. 不新增 LLM 集成测试
Call 1 / Call 2 涉及真实 LLM 调用，遵循项目惯例（无 LLM key 的集成测试），靠冒烟测试手动验证。

## 假设与边界

1. **`shots` 平铺由节点完成**：LLM 只产 `segments`，节点在 `model_dump()` 后注入 `shots = segments[].shots` 拼接。visual_designer / video_mvp / 画布导出读 `shots` 行为不变。
2. **`storyboard_text` 非关键**：Call 2 失败返回 `""`，不阻断节点；前端降级显示。最终 `scriptwriter_output` 仍写入 state。
3. **段数由 LLM 决定**：不硬编码 `ceil(60/15)=4`，由 LLM 按剧情因果 + ≤15s 约束自行切分。若 LLM 产出的某段 > 15s，04b 提示词会自行压缩（其规则已覆盖此情况）。
4. **模块级 prompt 加载**：`STORYBOARD_PROMPT = get_system_prompt("04b_storyboard_board")` 在 import 时执行；改 prompt 文件需重启后端（AGENTS.md 已知 quirk）。
5. **`get_system_prompt` 转义**：04b 提示词原文无 `{`/`}`，转义不破坏内容。若后续给 04b 加模板变量，需改用 `get_prompt()`。
6. **旧会话兼容**：已存的 `workshop_sessions` 快照中 `scriptwriter_output` 无 `segments` 字段；前端 `segments?` 可选 + 回退到 shots 表格，后端 `visual_designer` 读 `shots` 不受影响。重新跑 scriptwriter 步骤才会产 segments。
7. **文件规模**：`scriptwriter.py` 改造后 ~150 行 < 500；`AgentOutputView.tsx` 改造后 ~230 行 < 500；符合规范。
8. **性能**：1 + N 次 LLM 调用（N = 段数，通常 2-4）。比原 1 次慢 3-5 倍，但工坊是手动触发单步，可接受。后续可改并发（`asyncio.gather` + `ainvoke`）优化。
9. **`shot_id: int` 不变**：后端 `Shot.shot_id` 仍为 int；前端 `Shot.shot_id: string` 的既有 mismatch 不在本计划范围。

## 验证步骤

### 后端
1. `cd qinghe-video && pytest tests/ -v` —— 现有测试 + 两个新模型测试全绿。
2. 启动后端，用 curl + JWT 触发 scriptwriter 单步：
   ```bash
   curl -X POST http://localhost:18739/api/agents/scriptwriter \
     -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
     -d '{"input":{...UserInput}, "state":{...含 planner_output + copywriter_output}}'
   ```
   验证返回的 `state.scriptwriter_output`：
   - 有 `segments[]`，每段 `duration_seconds ≤ 15`
   - 每段 `storyboard_text` 非空，含 `S01`、`STATE CHAIN`、`END BEAT`、`DIRECTOR NOTES` 等 04b 标记
   - `shots[]` 平铺 = 所有段 shots 拼接，`shot_id` 连续
3. 用上一步 state 继续调 `visual_designer` 步骤，确认 `visual_output.shot_prompts` 仍按 `shot_id` 1:1 产出（向后兼容验证）。

### 前端
1. `cd qinghe-video/frontend && npx tsc --noEmit` —— 无类型错误。
2. `npm run dev`，进入 `/workshop`，跑完 planner → copywriter → scriptwriter。
3. **新会话**：ScriptwriterView 显示分段卡片，每段含 shots 表 + storyboard_text 多行文本块。
4. **旧会话**（手动构造无 segments 的快照或加载已有记录）：回退到平铺 shots 表格，不报错。
5. **导出画布**：点「在画布中编辑故事板」→ 画布 ShotNode 数量 = 平铺 shots 数（不受 segments 影响）。

## 实现顺序

1. 后端模型（B1）—— 先改 `models.py`，跑测试确认现有测试不回归 + 新模型测试通过。
2. 后端提示词（A1 + C2）—— 新建 `04b_storyboard_board.md`，改 `scriptwriter.txt`。
3. 后端节点（C1）—— 改造 `scriptwriter.py`，冒烟测试 1+N 调用。
4. 前端类型（D1）—— 改 `types/api.ts`。
5. 前端展示（D2）—— 改 `AgentOutputView.tsx`。
6. 测试（E1）—— 加 2 个模型单测。
7. 端到端验证（前后端联调）。

## 关键文件清单

**新增**：
- `qinghe-video/src/prompts/04b_storyboard_board.md`

**修改（后端）**：
- `qinghe-video/src/models.py`（新增 `StorySegment`，改 `ScriptwriterOutput`）
- `qinghe-video/src/nodes/scriptwriter.py`（1+N 调用 + shots 平铺）
- `qinghe-video/src/prompts/scriptwriter.txt`（输出格式改 segments）

**修改（前端）**：
- `qinghe-video/frontend/src/types/api.ts`（`StorySegment` + `ScriptwriterOutput.segments?`）
- `qinghe-video/frontend/src/components/agent/AgentOutputView.tsx`（`ScriptwriterView` 分段卡片）

**修改（测试）**：
- `qinghe-video/tests/test_graph.py`（2 个新模型单测）

## Phase 2 预告（不在本计划范围）

- 每段 `storyboard_text` → 生成 1 张完整故事板图片（用户已有相关提示词，待接入）。
- 每段图片 → 合成 1 个 ≤15s 视频（可能需扩展 `video_compose` 支持逐镜时长，或按段独立合成）。
- N 个独立 mp4 产物（用户已选「N 个独立视频」）。
- 工坊 UI 增加每段「生图 / 合成视频」按钮 + 产物展示区。
