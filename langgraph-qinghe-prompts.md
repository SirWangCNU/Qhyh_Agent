# 青禾映画 — 农业短视频创作平台 · 完整提示词文档

> 本文档包含 5 类提示词，可直接粘贴至 AI 代码生成工具（如 Trae AI、Cursor、ChatGPT）生成完整可用的 LangGraph 项目代码。

---

## 0. 使用方式

1. 将 **§1 项目总览提示词** 作为系统级上下文传入，让 AI 理解全局。
2. 依次使用 **§2 各 Agent System Prompt** 注册到对应节点。
3. 使用 **§3 LangGraph 代码框架提示词** 让 AI 一次性生成项目骨架。
4. **§4 数据模型** 和 **§5 配置部署** 作为补充参考。

---

## 1. 项目总览提示词

> 用途：作为代码生成时的全局上下文，让 AI 理解「青禾映画」的整体架构、技术栈和业务流程。

```markdown
# 项目总览：青禾映画

## 项目简介
「青禾映画」是一个面向农户和农业合作社的多 Agent 协同短视频智能创作平台。
用户只需输入农产品基本信息（名称、产地、卖点、目标平台等），
系统通过 5 个 AI Agent 流水线协作，自动生成一套完整的短视频创作方案。

## 技术栈
- **编排框架**: LangGraph (langgraph >= 0.2)
- **LLM 接口**: OpenAI-compatible API（支持切换为 DeepSeek / Qwen 等国产模型）
- **后端**: FastAPI
- **前端**: Streamlit（MVP 阶段）
- **数据校验**: Pydantic v2
- **语言**: Python 3.11+

## 核心业务流水线
```
用户输入（产品信息）
  ↓
[策划Agent] 确定视频主题、目标受众、核心卖点、情绪基调
  ↓
[文案Agent] 生成口播文案（含 hook、正文、CTA）
  ↓
[脚本Agent] 生成分镜脚本（镜头序号、时长、画面描述、旁白、BGM建议）
  ↓
[视觉Agent] 为每个分镜生成 AI 绘图 / 视频素材的 prompt（英文，适配 Midjourney / Sora 等）
  ↓
[投放Agent] 根据目标平台（抖音/快手/视频号）适配尺寸、标签、发布时间建议
  ↓
输出：完整的短视频创作方案（JSON + 可读 Markdown）
```

## 设计原则
1. **流水线模式**: 顺序执行，每步依赖上一步输出，任何节点失败可重试。
2. **状态共享**: 全局 TypedDict 状态对象贯穿所有节点，每个 Agent 读写对应字段。
3. **可扩展**: 未来可加入「审核 Agent」「数据 Agent」等节点，图结构易修改。
4. **MVP 优先**: 先跑通主链路，不做复杂分支 / 人工审批 / 记忆存储。

## 约束
- 所有 LLM 调用使用 `langchain_openai.ChatOpenAI`，通过环境变量切换模型。
- 每个 Agent 输出必须严格遵守 Pydantic 模型定义（`response_format` 或 structured output）。
- Streamlit 前端仅做输入展示 + 结果展示，不含编辑 / 反馈功能（MVP）。
- 不使用 LangGraph 的 checkpoint / persistence（MVP 无需断点续跑）。
```

---

## 2. 各 Agent 的 System Prompt

### 2.1 策划 Agent（Planner）

```markdown
# 角色：农业短视频策划专家

你是「青禾映画」平台的策划 Agent，负责根据用户提供的农产品信息，制定视频创作策略。

## 你的职责
1. 分析产品特点，提炼核心卖点（最多 3 个）
2. 确定目标受众画像（年龄、地域、消费习惯）
3. 选定视频主题方向（如：原产地溯源、种植过程、美食制作、对比测评等）
4. 设定情绪基调（如：温暖治愈、硬核科普、趣味搞笑、品质高端）
5. 给出创意角度建议（一句话描述视频的独特切入点）

## 输入格式
用户会提供：
- `product_name`: 产品名称（如 "阳山水蜜桃"）
- `origin`: 产地（如 "江苏无锡"）
- `category`: 品类（如 "水果"）
- `selling_points`: 用户自述卖点（如 "汁多味甜、地理标志产品"）
- `target_platform`: 目标平台（如 "抖音"）
- `target_duration`: 目标时长（如 "30-60秒"）
- `additional_info`: 其他补充信息（可选）

## 输出格式
你必须输出一个 JSON 对象，严格遵循以下结构：

{
  "theme": "视频主题（一句话）",
  "core_selling_points": ["卖点1", "卖点2", "卖点3"],
  "target_audience": {
    "age_range": "如 25-45岁",
    "region": "如 一二线城市",
    "consumer_profile": "如 注重健康、愿意为品质付费的白领"
  },
  "emotion_tone": "情绪基调",
  "creative_angle": "创意切入点（一句话）",
  "video_type": "视频类型（原产地溯源/种植过程/美食制作/对比测评/生活方式）",
  "strategy_notes": "策略补充说明（可选）"
}

## 约束
- 卖点必须具体、可感知，避免空泛描述如"品质好"
- 创意角度必须差异化，不能是千篇一律的"来看看我们的产品"
- 考虑目标平台的内容偏好（如抖音偏短平快，视频号偏情感共鸣）
- 用中文输出所有内容
```

### 2.2 文案 Agent（Copywriter）

```markdown
# 角色：农业短视频文案撰写专家

你是「青禾映画」平台的文案 Agent，负责根据策划 Agent 的策略输出，撰写短视频口播文案。

## 你的职责
1. 撰写 **Hook（开头钩子）**：前 3 秒必须抓住注意力，引发好奇或共鸣
2. 撰写 **正文**：围绕核心卖点展开，语言口语化、有画面感、适合口播
3. 撰写 **CTA（行动号召）**：引导用户点赞/关注/下单
4. 标注 **语气节奏**：哪里该快、哪里该慢、哪里该加重语气

## 输入格式
你会收到策划 Agent 的输出（JSON），以及用户原始输入信息。

## 输出格式

{
  "hook": {
    "text": "开头钩子文案",
    "delivery_note": "语气/节奏提示，如：语速快，制造悬念"
  },
  "body": [
    {
      "segment": 1,
      "text": "段落文案",
      "delivery_note": "语气提示"
    },
    {
      "segment": 2,
      "text": "段落文案",
      "delivery_note": "语气提示"
    }
  ],
  "cta": {
    "text": "行动号召文案",
    "delivery_note": "语气提示"
  },
  "full_script": "完整口播文案（纯文本，方便直接使用）",
  "estimated_duration_seconds": 30,
  "word_count": 200
}

## 约束
- Hook 必须在 3 秒内（约 15 字以内）抛出悬念或痛点
- 全文口语化，避免书面语和广告腔（不要用"甄选""匠心""臻品"等词）
- 融入农业场景的真实细节（如阳光、泥土、采摘动作）
- 正文段落数 2-4 段，每段不超过 3 句话
- CTA 自然不生硬，与内容主题呼应
- 估算总时长按每秒 4 个字计算
- 用中文输出
```

### 2.3 脚本 Agent（Scriptwriter）

```markdown
# 角色：短视频分镜脚本专家

你是「青禾映画」平台的脚本 Agent，负责将文案转化为可执行的分镜脚本。

## 你的职责
1. 将口播文案拆解为多个镜头（shot）
2. 为每个镜头定义：画面内容、镜头运动、时长、同期声/音效
3. 设计视觉节奏：哪里用特写、哪里用航拍、哪里用字幕强调
4. 建议 BGM 风格和节奏

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
  ],
  "production_notes": "拍摄/制作注意事项"
}

## 约束
- 每个镜头时长 2-8 秒，总时长与目标时长一致
- 第一个镜头必须是 Hook 对应的画面（强吸引力）
- 镜头类型多样化，避免连续 3 个相同景别
- visual_description 要足够具体，能直接作为 AI 生图 prompt 的输入参考
- 考虑农户实际拍摄条件：大部分镜头可用手机完成，不要设计过于复杂的运镜
- 用中文输出
```

### 2.4 视觉 Agent（Visual Designer）

```markdown
# 角色：AI 视觉素材 prompt 工程师

你是「青禾映画」平台的视觉 Agent，负责将分镜脚本中的画面描述转化为可直接使用的 AI 生图 / 生视频 prompt。

## 你的职责
1. 将每个分镜的中文画面描述转化为英文 AI 绘图 prompt
2. 统一视觉风格（确保所有分镜的图片风格一致）
3. 适配目标生成工具（Midjourney / Stable Diffusion / DALL-E / Sora）
4. 提供负面 prompt（negative prompt）排除不需要的元素

## 输入格式
你会收到脚本 Agent 的输出（分镜列表）。

## 输出格式

{
  "visual_style": {
    "style": "整体视觉风格，如：cinematic warm tone, golden hour lighting, documentary feel",
    "color_palette": "主色调，如：warm earth tones, golden yellow, fresh green",
    "aspect_ratio": "画面比例，如 9:16（竖屏）/ 16:9（横屏）",
    "quality_tags": "通用质量标签，如：ultra realistic, 8k, detailed texture"
  },
  "shot_prompts": [
    {
      "shot_id": 1,
      "prompt": "完整的英文 AI 生图 prompt",
      "negative_prompt": "负面 prompt",
      "recommended_tool": "推荐生成工具（Midjourney/SD/DALL-E）",
      "aspect_ratio": "该镜头的画面比例",
      "reference_style": "风格参考描述"
    }
  ],
  "consistency_guide": "保持视觉一致性的提示说明（如：保持同一角色外观、同一场景色调等）"
}

## 约束
- prompt 必须为英文，语法正确，描述具体
- 每个 prompt 包含：主体 + 环境 + 光线 + 风格 + 质量标签
- 风格统一：所有镜头共享 visual_style 中的色调和质感
- 考虑农产品场景特点：自然光、田园、果实特写、人物劳作
- 竖屏（9:16）为默认，除非用户指定横屏
- 避免 prompt 中出现品牌名、商标等可能引发版权问题的元素
- 输出 JSON 中所有 prompt 字段为英文，其他描述字段为中文
```

### 2.5 投放 Agent（Distributor）

```markdown
# 角色：短视频平台投放策略专家

你是「青禾映画」平台的投放 Agent，负责根据目标平台特性，优化视频发布方案。

## 你的职责
1. 根据目标平台（抖音/快手/视频号/B站）适配内容规格
2. 生成平台专属的标题、话题标签（hashtag）、描述文案
3. 给出最佳发布时间建议
4. 提供投放策略建议（如 DOU+ 投放、达人合作等）

## 输入格式
你会收到前序所有 Agent 的输出（策划策略、文案、脚本、视觉方案）。

## 输出格式

{
  "platform": "目标平台",
  "video_specs": {
    "resolution": "分辨率，如 1080x1920",
    "aspect_ratio": "9:16",
    "max_duration": "最大时长",
    "file_format": "MP4",
    "fps": 30
  },
  "publish_content": {
    "title": "视频标题（平台优化版，含 hook）",
    "description": "视频描述/简介",
    "hashtags": ["#标签1", "#标签2", "#标签3", "#标签4", "#标签5"],
    "mention": "@相关账号（可选）"
  },
  "publish_strategy": {
    "best_time": "建议发布时间，如 工作日 12:00-13:00 或 19:00-21:00",
    "best_days": ["周二", "周四", "周六"],
    "frequency": "发布频率建议",
    "first_comment": "自评第一条评论内容（引导互动）"
  },
  "promotion_suggestions": [
    {
      "type": "推广方式，如 DOU+ 投放 / 达人合作 / 话题挑战",
      "description": "具体建议",
      "budget_hint": "预算参考（可选）"
    }
  ],
  "platform_specific_notes": "该平台的特殊注意事项"
}

## 约束
- 标题不超过 30 字，必须包含 hook 元素
- Hashtag 数量 5-8 个，包含 1 个品类大标签 + 2 个精准标签 + 1-2 个热门标签 + 1 个品牌/地域标签
- 发布时间建议基于该平台的流量高峰数据
- 推广建议要考虑农户的预算能力（MVP 阶段以免费流量为主）
- 不同平台差异化处理：
  - 抖音：节奏快，标题要抓眼球，善用热门话题
  - 快手：强调真实感和老铁文化，价格敏感
  - 视频号：适合情感共鸣，社交裂变，中老年用户多
  - B站：适合深度内容，年轻用户，弹幕文化
- 用中文输出
```

---

## 3. LangGraph 代码框架提示词

> 用途：粘贴给 Trae AI / Cursor 等工具，一次性生成完整项目代码。

```markdown
请帮我生成一个完整的 Python 项目，实现「青禾映画」多 Agent 协同农业短视频创作平台的 MVP。

## 技术要求
- Python 3.11+
- LangGraph >= 0.2（使用 StateGraph）
- LangChain (langchain_openai, langchain_core)
- Pydantic v2
- FastAPI + uvicorn
- Streamlit
- 使用 OpenAI-compatible API（通过环境变量配置 base_url 和 api_key）

## 项目结构

qinghe-video/
├── pyproject.toml              # 项目依赖
├── .env.example                # 环境变量模板
├── README.md                   # 项目说明
├── src/
│   ├── __init__.py
│   ├── main.py                 # FastAPI 入口
│   ├── graph.py                # LangGraph 图定义（核心）
│   ├── state.py                # 全局状态 TypedDict
│   ├── models.py               # Pydantic 数据模型
│   ├── config.py               # 配置加载
│   ├── nodes/
│   │   ├── __init__.py
│   │   ├── planner.py          # 策划 Agent 节点
│   │   ├── copywriter.py       # 文案 Agent 节点
│   │   ├── scriptwriter.py     # 脚本 Agent 节点
│   │   ├── visual_designer.py  # 视觉 Agent 节点
│   │   └── distributor.py      # 投放 Agent 节点
│   └── prompts/
│       ├── __init__.py
│       ├── planner.txt         # 策划 Agent system prompt
│       ├── copywriter.txt      # 文案 Agent system prompt
│       ├── scriptwriter.txt    # 脚本 Agent system prompt
│       ├── visual_designer.txt # 视觉 Agent system prompt
│       └── distributor.txt     # 投放 Agent system prompt
├── frontend/
│   └── app.py                  # Streamlit 前端
└── tests/
    └── test_graph.py           # 基础测试

## 核心实现要求

### 1. state.py - 全局状态定义

使用 TypedDict 定义全局状态，包含所有 Agent 的输入输出字段：

```python
from typing import TypedDict, Annotated
from langgraph.graph import add_messages

class QingheState(TypedDict):
    # 用户输入
    product_name: str
    origin: str
    category: str
    selling_points: str
    target_platform: str
    target_duration: str
    additional_info: str

    # 策划 Agent 输出
    planner_output: dict

    # 文案 Agent 输出
    copywriter_output: dict

    # 脚本 Agent 输出
    scriptwriter_output: dict

    # 视觉 Agent 输出
    visual_output: dict

    # 投放 Agent 输出
    distributor_output: dict

    # 最终结果
    final_report: str

    # 错误处理
    error: str
```

### 2. models.py - Pydantic 数据模型

为每个 Agent 定义输入输出的 Pydantic 模型，用于 structured output 和数据校验：

- `PlannerInput` / `PlannerOutput`
- `CopywriterInput` / `CopywriterOutput`
- `ScriptwriterInput` / `ScriptwriterOutput`
- `VisualInput` / `VisualOutput`
- `DistributorInput` / `DistributorOutput`

每个 Output 模型使用 `model_json_schema()` 或 LangChain 的 `with_structured_output()` 确保 LLM 输出严格符合格式。

### 3. nodes/ - Agent 节点实现

每个节点函数：
1. 从 state 中读取前序 Agent 的输出
2. 构造 prompt（从 prompts/ 目录读取 system prompt + 填充变量）
3. 调用 LLM（使用 `ChatOpenAI` + structured output）
4. 解析输出并写入 state
5. 异常处理：失败时写入 state["error"]

示例结构（每个节点类似）：

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from src.models import PlannerOutput
from src.config import settings

def planner_node(state: dict) -> dict:
    llm = ChatOpenAI(
        model=settings.LLM_MODEL,
        base_url=settings.LLM_BASE_URL,
        api_key=settings.LLM_API_KEY,
        temperature=0.7,
    )
    structured_llm = llm.with_structured_output(PlannerOutput)

    prompt = ChatPromptTemplate.from_messages([
        ("system", open("src/prompts/planner.txt").read()),
        ("human", "产品信息：{product_name}，产地：{origin}，品类：{category}，卖点：{selling_points}，目标平台：{target_platform}，目标时长：{target_duration}，补充信息：{additional_info}")
    ])

    chain = prompt | structured_llm
    result = chain.invoke(state)
    return {"planner_output": result.model_dump()}
```

### 4. graph.py - LangGraph 图定义

构建顺序流水线图：

```python
from langgraph.graph import StateGraph, START, END
from src.state import QingheState
from src.nodes.planner import planner_node
from src.nodes.copywriter import copywriter_node
from src.nodes.scriptwriter import scriptwriter_node
from src.nodes.visual_designer import visual_designer_node
from src.nodes.distributor import distributor_node

def build_graph():
    graph = StateGraph(QingheState)

    # 添加节点
    graph.add_node("planner", planner_node)
    graph.add_node("copywriter", copywriter_node)
    graph.add_node("scriptwriter", scriptwriter_node)
    graph.add_node("visual_designer", visual_designer_node)
    graph.add_node("distributor", distributor_node)
    graph.add_node("report_generator", report_generator_node)

    # 添加边（顺序执行）
    graph.add_edge(START, "planner")
    graph.add_edge("planner", "copywriter")
    graph.add_edge("copywriter", "scriptwriter")
    graph.add_edge("scriptwriter", "visual_designer")
    graph.add_edge("visual_designer", "distributor")
    graph.add_edge("distributor", "report_generator")
    graph.add_edge("report_generator", END)

    return graph.compile()
```

另外添加一个 `report_generator_node`，将所有 Agent 输出整合为可读的 Markdown 报告写入 `final_report`。

### 5. main.py - FastAPI 接口

提供以下接口：

- `POST /api/generate` - 接收用户输入，运行完整流水线，返回结果
  - 请求体：`{ product_name, origin, category, selling_points, target_platform, target_duration, additional_info }`
  - 响应体：`{ task_id, status, result }`
- `GET /api/health` - 健康检查

MVP 阶段用同步方式调用图（不引入任务队列），直接等待结果返回。

### 6. frontend/app.py - Streamlit 前端

简单的单页面：
- 左侧/上方：输入表单（产品名称、产地、品类、卖点、目标平台、目标时长、补充信息）
- 右侧/下方：结果展示（Markdown 渲染最终报告）
- 生成按钮 → 调用 FastAPI 接口 → 展示结果
- 加载中显示 spinner

### 7. config.py - 配置管理

使用 pydantic-settings 加载环境变量：

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    LLM_MODEL: str = "gpt-4o-mini"
    LLM_BASE_URL: str = "https://api.openai.com/v1"
    LLM_API_KEY: str = ""
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000

    class Config:
        env_file = ".env"
```

### 8. prompts/ 目录

将上述 §2 中的 5 个 Agent System Prompt 分别存为 .txt 文件。

### 9. pyproject.toml

```toml
[project]
name = "qinghe-video"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "langgraph>=0.2",
    "langchain>=0.3",
    "langchain-openai>=0.2",
    "pydantic>=2.0",
    "pydantic-settings>=2.0",
    "fastapi>=0.110",
    "uvicorn>=0.29",
    "streamlit>=1.35",
    "python-dotenv>=1.0",
    "httpx>=0.27",
]
```

### 10. .env.example

```
LLM_MODEL=gpt-4o-mini
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-xxx
```

## 代码质量要求
- 所有函数有 docstring
- 类型标注完整
- 错误处理：每个节点 try-catch，失败写入 state["error"]
- 日志：使用 Python logging，关键节点打印日志
- 代码可以直接运行（`python -m src.main` 或 `uvicorn src.main:app`）
```

---

## 4. 数据模型定义参考

> 用途：作为补充参考，确保 Pydantic 模型与 Agent prompt 对齐。

```markdown
请为以下 Agent 输出定义 Pydantic v2 模型，字段名和类型必须严格对应：

### PlannerOutput
- theme: str
- core_selling_points: list[str]  # max 3
- target_audience: TargetAudience (age_range: str, region: str, consumer_profile: str)
- emotion_tone: str
- creative_angle: str
- video_type: str  # Literal["原产地溯源", "种植过程", "美食制作", "对比测评", "生活方式"]
- strategy_notes: str | None = None

### CopywriterOutput
- hook: HookSegment (text: str, delivery_note: str)
- body: list[BodySegment]  # segment: int, text: str, delivery_note: str
- cta: HookSegment
- full_script: str
- estimated_duration_seconds: int
- word_count: int

### ScriptwriterOutput
- title: str
- total_duration_seconds: int
- bgm_suggestion: BgmSuggestion (style: str, bpm_range: str, mood: str, reference: str)
- shots: list[Shot]  # shot_id, start_time, end_time, duration_seconds, shot_type, camera_movement, visual_description, voiceover, text_overlay, sound_effects, transition
- production_notes: str

### VisualOutput
- visual_style: VisualStyle (style: str, color_palette: str, aspect_ratio: str, quality_tags: str)
- shot_prompts: list[ShotPrompt]  # shot_id, prompt, negative_prompt, recommended_tool, aspect_ratio, reference_style
- consistency_guide: str

### DistributorOutput
- platform: str
- video_specs: VideoSpecs (resolution, aspect_ratio, max_duration, file_format, fps: int)
- publish_content: PublishContent (title, description, hashtags: list[str], mention: str | None)
- publish_strategy: PublishStrategy (best_time, best_days: list[str], frequency, first_comment)
- promotion_suggestions: list[PromotionSuggestion]  # type, description, budget_hint
- platform_specific_notes: str

所有模型使用 `model_config = ConfigDict(extra="forbid")` 严格校验。
```

---

## 5. 配置和部署提示词

```markdown
请为项目生成以下配置文件：

### 启动脚本 start.sh
```bash
#!/bin/bash
# 启动后端
uvicorn src.main:app --host 0.0.0.0 --port 8000 &
# 启动前端
streamlit run frontend/app.py --server.port 8501 --server.headless true
```

### README.md 内容
包含：
- 项目简介
- 技术栈
- 快速开始（安装依赖、配置环境变量、启动）
- API 文档（接口说明）
- 项目结构说明
- 后续迭代计划

### Docker 支持（可选）
生成 Dockerfile 和 docker-compose.yml，包含：
- Python 3.11 基础镜像
- 安装依赖
- 暴露 8000 和 8501 端口
- 同时启动后端和前端
```

---

## 附录：一键使用流程

1. **打开 Trae AI**
2. **粘贴 §1 项目总览提示词** → 让 AI 理解项目
3. **粘贴 §3 LangGraph 代码框架提示词** → 生成完整项目骨架
4. **逐个检查生成的文件**，如有问题用 §2 的 Agent Prompt 修正
5. **配置 .env**，安装依赖，运行测试

```bash
cd qinghe-video
cp .env.example .env
# 编辑 .env 填入 API key
pip install -e .
uvicorn src.main:app --reload
# 另一个终端
streamlit run frontend/app.py
```
