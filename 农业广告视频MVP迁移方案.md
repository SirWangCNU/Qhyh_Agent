# 多 Agent 农业广告视频生成 — MVP 迁移方案

> 目标：以**最小迁移成本**，把现有 AutoVideoAgent 的能力裁剪、复用到「多 Agent 农业广告视频生成」MVP。
> 原则：能复用就不重写；先跑通主链路，再谈复杂度。

---

## 一、现状盘点（迁移的"家底"）

现有项目 `AutoVideoAgent` 是一个 **React 19 + FastAPI** 全栈视频生成系统，核心资产如下：

| 模块 | 路径 | MVP 是否复用 |
|------|------|-------------|
| 多 Agent 编排（LangGraph StateGraph） | `backend/workflows/unified/` | ✅ 复用骨架 |
| 核心服务（Mixin 组合：session/storyboard/images/clips/final/chat） | `backend/services/auto_agent/` | ✅ 复用主链路 |
| 营销策划 Agent | `backend/agents/planners/marketing_planner.py` | 🔧 改写为农业场景 |
| 分镜生成 | `services/auto_agent/storyboard*.py`、`dashscope_storyboard.py` | ✅ 复用 |
| 文生图/图生图（多 provider） | `services/seedream_image_service.py` 等 | ✅ 保留 1 个 |
| 图生视频（多 provider） | `services/seedance_service.py` 等 | ✅ 保留 1 个 |
| TTS 配音 | `services/tts_service.py`（edge-tts） | ✅ 复用 |
| 视频合成/剪辑 | `services/video_editor_service.py`（moviepy） | ✅ 复用 |
| BGM | `services/bgm_ai_service.py` | ⚪ 可选 |
| 实时进度（WebSocket + Redis pub/sub） | `backend/app/auto_routes_ws.py` | 🔧 降级为进程内 |
| 前端 Agent 交互页 | `frontend/src/pages/autoAgent/` | ✅ 复用 |
| 提示词模板（Jinja2） | `backend/prompts/templates/` | 🔧 改写农业话术 |

**主链路（保留）**：
`输入产品/主题 → 需求补全(chat) → 分镜方案 → 逐镜生图 → 逐镜生视频 → 合成 + 配音/BGM → 成片`

**MVP 砍掉的部分**（降低迁移成本）：
- 登录/鉴权（JWT/passlib）、用户/团队/分组管理
- 充值、Token 计费、用量统计、消费记录
- 多余的生图/生视频 provider（保留各 1 个）
- 飞书/Excel 批量、数字人、SAM 抠图、人脸检测
- MySQL（MVP 用 SQLite）、Redis（MVP 用进程内队列）

---

## 二、需求分析（农业广告视频生成 MVP）

### 2.1 业务目标
让农业从业者（农户/合作社/农产品商家）输入**产品信息 + 产品图**，由多 Agent 协作自动产出一条 **15–30 秒**的农业广告短视频。

### 2.2 目标用户与场景
- 农产品电商卖家：水果、蔬菜、粮油、土特产带货短视频
- 合作社/产地直发：突出产地、生态、新鲜、品质
- 投放渠道：抖音/快手/视频号竖屏 9:16

### 2.3 核心功能需求（MoSCoW）

**Must（MVP 必做）**
1. 输入：产品名称、卖点、目标人群、产品图（1–3 张）
2. 农业营销策划 Agent：生成广告脚本与卖点（产地/新鲜/健康/性价比）
3. 分镜 Agent：拆分 4–6 个镜头（画面描述 + 旁白文案）
4. 生图 Agent：基于产品图 + 分镜，逐镜生成画面
5. 生视频 Agent：逐镜图生视频
6. 配音 + 合成 Agent：TTS 旁白 + 拼接 → 输出竖屏成片
7. 实时进度反馈（前端可见每个 Agent 的执行状态）

**Should**
- 多轮对话补全需求（用户可修改卖点/风格）
- 分镜方案二选一
- 背景音乐

**Could / Won't（MVP 不做）**
- 鉴权、计费、批量、数字人、多 provider 切换

### 2.4 非功能需求（MVP 级）
| 项 | 要求 |
|----|------|
| 并发 | 单机 ≤ 3 路并发即可 |
| 时延 | 单视频可接受 3–8 分钟（受生图/生视频 API 限制） |
| 部署 | 单机 SQLite + 进程内队列，`python app.py` 一键起 |
| 成本 | 复用现有第三方 API Key，无新增基础设施 |

---

## 三、技术实现方案（最小迁移成本）

### 3.1 总体策略
**直接 fork 现有仓库 → 删裁非核心模块 → 改写农业相关的 3 处提示词/Agent → 关掉鉴权**。
不重建架构，不换框架。预计改动集中在「提示词 + 路由裁剪 + 配置开关」。

### 3.2 后端改造清单

**① 多 Agent 编排（复用 LangGraph 骨架）**
- 复用 `backend/workflows/unified/`，节点不变：
  `requirements → reference_analysis → planner → asset_generation → editor`
- 仅替换 `nodes/planner.py` 调用的策划 Agent 为农业版。

**② 农业营销策划 Agent（核心改写点）**
- 复制 `agents/planners/marketing_planner.py` → `agricultural_planner.py`
- 改写系统提示词，注入农业广告知识：
  - 卖点维度：产地溯源、有机/生态、新鲜直发、营养健康、应季尝鲜、性价比
  - 镜头语言：产品特写、田间实景、烹饪/食用场景、产地远景
  - 文案风格：口语化、信任感、行动号召（CTA）

**③ 提示词模板改写**
- `backend/prompts/templates/` 下分镜、生图提示词模板，加入农业视觉关键词（田园、丰收、自然光、新鲜质感等）。

**④ 收敛 provider（减依赖）**
- 生图：仅保留 `seedream_image_service.py`（ARK Key）
- 生视频：仅保留 `seedance_service.py`
- TTS：保留 `tts_service.py`（edge-tts，免费）
- 删除其余 `qwen_*/sora_*/laozhang_*/wan_r2v/agaigw` 等 submit/service 文件及其路由引用。

**⑤ 关闭鉴权与计费（最快见效）**
- 路由层移除/跳过 `auth_routes/`、`payment_routes/`，前端去掉登录页（README 本身已支持"无需登录"模式，沿用即可）。
- 删除 `consumption_service.py`、`token_usage*`、`group_*`、`team_*`、`usage_stats.py` 相关 router 注册。

**⑥ 实时通信降级**
- `auto_routes_ws.py` 已内置「Redis 不可用时降级为进程内 `notification_service.subscribe_local`」——MVP 直接**不部署 Redis**，零改动自动走进程内队列。

**⑦ 存储与数据库**
- DB：`USE_SQLITE=true`（默认），用 `autovideoagent.sqlite`。
- 文件：本地 `uploads/` + `outputs/`，**不配 TOS/OSS**（生图自动降级 Base64 直传）。

### 3.3 前端改造清单
- 保留 `frontend/src/pages/autoAgent/` 整套（hooks 动作分治 + 5 步面板）。
- 文案/标题改为"农业广告视频"，输入表单字段改为：产品名、产地、卖点、目标人群、产品图。
- 删除侧栏中 充值/用量统计/用户管理/图片工作室 等入口（`components/Layout/Sidebar.jsx`）。
- 保留：`Step1ParseLinks→Step5Final` 流程、`VideoViewer`、`ImageViewer`、WebSocket hook。

### 3.4 最小技术栈（迁移后）
```
后端: FastAPI + LangGraph + SQLAlchemy(SQLite) + moviepy + edge-tts
生图: 火山 ARK Seedream      生视频: 火山 Seedance
前端: React 19 + Vite + Tailwind + Zustand
通信: WebSocket(进程内队列)   部署: 单机 python app.py + npm run dev
```

### 3.5 环境变量（MVP 最小集）
```ini
USE_SQLITE=true
ARK_API_KEY=<火山引擎 ARK Key>      # 生图 + 生视频必填
AUTO_AGENT_MAX_CONCURRENT=3
# 以下可不配（自动降级）：TOS_*、OSS_*、REDIS_*、MYSQL_*
```

---

## 四、迁移实施步骤（建议顺序）

1. **复制仓库**：fork 一份，新建 `.venv` 装 `requirements.txt`（可先精简掉 oss2/tos/aiomysql）。
2. **跑通原链路**：配 `ARK_API_KEY`，`python app.py` + 前端 `npm run dev`，确认能出一条视频（验证家底可用）。
3. **关鉴权/计费**：注释相关 router 注册 + 前端去登录，确认无报错。
4. **裁 provider**：只留 seedream + seedance + edge-tts，删其余 service 及引用。
5. **改农业 Agent**：写 `agricultural_planner.py` + 农业提示词模板。
6. **改前端文案/表单/侧栏**。
7. **端到端验收**：输入一个农产品 + 图，跑出竖屏广告片。

> 关键提醒：第 2 步先验证"复用的家底能跑"，再动手裁剪，避免改坏后无法定位是迁移问题还是裁剪问题。

---

## 五、MVP 验收标准

- [ ] 上传 1 张农产品图 + 填写卖点，点击开始
- [ ] 前端实时显示 5 个阶段进度（策划/分镜/生图/生视频/合成）
- [ ] 产出 ≥1 条 9:16、15–30s、含旁白配音的农业广告视频
- [ ] 单机无 Redis / 无 MySQL / 无对象存储即可运行
- [ ] 全流程无需登录

---

## 六、风险与后续演进

| 风险 | MVP 对策 | 后续 |
|------|---------|------|
| 生图/生视频 API 慢或失败 | 已有 `tenacity` 重试 + 进度反馈 | 加缓存/兜底素材 |
| 农业话术不够专业 | 先用提示词注入行业知识 | 沉淀农业广告语料/微调 |
| 进程内队列重启丢任务 | MVP 可接受 | 上 Redis pub/sub（代码已支持） |
| 并发上限低 | 限 3 路 | 切 MySQL + Redis 扩容 |

---

**结论**：本方案不重写架构，迁移动作集中在「删裁 + 3 处农业化改写 + 配置降级」，可在现有代码上以最小成本跑通一个可用的农业广告视频生成 MVP。
