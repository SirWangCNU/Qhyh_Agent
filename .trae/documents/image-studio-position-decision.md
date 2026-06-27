# 图像处理工作室 · 功能位置决策

## Summary

图像处理工作室功能（九宫格导演板生成）已完整实现并集成。本方案聚焦于"功能加在哪里比较合适"的位置决策分析，确认保留当前**独立页面 `#/image-studio`** 的放置方式，并提议一项轻量增强以衔接主创作流程。

## 当前状态分析

### 已实现的完整链路

经代码库探索确认，图像工作室功能在前后端均已完整落地：

**后端（6 个文件，均 ≤ 159 行）**
- [src/image_studio/__init__.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/image_studio/__init__.py) — 导出 `image_studio_router`
- [src/image_studio/models.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/image_studio/models.py) — 5 个 Pydantic v2 模型，`extra="forbid"`
- [src/image_studio/prompt_builder.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/image_studio/prompt_builder.py) — LLM 生成 9 维度变体 prompt
- [src/image_studio/image_variants.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/image_studio/image_variants.py) — 并发调用 doubao-seedream 图生图
- [src/image_studio/grid_composer.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/image_studio/grid_composer.py) — Pillow 拼 3×3 九宫格
- [src/image_studio/router.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/image_studio/router.py) — 2 个端点，鉴权保护

**Prompt 文件**
- [src/prompts/image_studio_director_board.md](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/prompts/image_studio_director_board.md) — 9 维度系统提示词

**后端集成**
- [src/main.py#L32](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/main.py#L32) 导入、[#L63](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/main.py#L63) 注册路由
- [src/config.py#L55-L58](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/config.py#L55-L58) 3 项专属配置

**前端（导航/页面/CSS/JS/路由五件套）**
- [index.html#L124](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/index.html#L124) 顶部导航项 `#/image-studio`
- [index.html#L502](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/index.html#L502) `imageStudioPage` section
- [index.html#L17](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/index.html#L17) 引入 CSS
- [index.html#L681](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/index.html#L681) 引入 JS
- [router.js#L110](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/assets/js/router.js#L110) 注册哈希路由

## 位置决策分析

广告视频创作完整链路：

```
素材准备（图像工作室）→ 创作方案（planner→...→distributor）→ 视频合成（workshop + video-compose）
```

图像工作室承担「素材准备/创意探索」前置阶段。对比 4 个候选位置：

| 候选位置 | 优点 | 缺点 | 取舍 |
|---------|------|------|------|
| **独立页面 `#/image-studio`（当前）** | 符合"先独立起来"约束；模块化清晰；不干扰主流程；易于后续接入 LangGraph | 与主流程割裂，需手动切换页面 | **推荐** — 边界清晰，可演进 |
| workshop 前置步骤 | 与分步工坊融合；选定风格可自动传递 | workshop.js 已超 300 行需重构；与"先独立起来"约束冲突 | 不推荐 — 耦合过深 |
| create 页面子区域 | 创作入口即可准备素材；无需跳转 | create 页面职责变重；干扰快速创作流程 | 不推荐 — 职责混乱 |
| chat 侧边工具 | 对话中可随时调用；适合探索性创作 | chat 页面交互复杂度增加；与对话流程耦合 | 不推荐 — 交互负担重 |

### 决策：保留独立页面 `#/image-studio`

**理由**：
1. 符合用户既定约束"先独立起来，等我其他流程弄好再接入，保证代码模块化"
2. 与现有 create/chat/workshop/agents 四个平级页面一致的导航结构
3. 独立模块便于后续接入 LangGraph 流水线（作为 visual_designer 的前置素材生成节点）
4. 用户可在创作前独立探索风格变体，选定后再进入主流程

## Proposed Changes

### 必须实施：无

功能已完整实现并集成，位置决策为保留现状，**无需任何代码改动**。

### 可选增强（建议下一步，不在本次必须实施范围）

为缓解"与主流程割裂"的缺点，可在图像工作室页面增加「用此素材开始创作」衔接按钮，将选定变体图传递给 create 页面预填参考图。此增强涉及对 create 页面的修改，建议作为独立任务在用户其他流程就绪后再实施。

**增强草案**（仅供参考，不在本方案必须实施范围）：
1. `image-studio.js` 在九宫格结果区下方渲染「用此素材开始创作」按钮
2. 点击后通过 `sessionStorage` 写入选定变体图 URL，跳转 `#/create`
3. create 页面读取 `sessionStorage`，在表单中显示参考图缩略图

## Assumptions & Decisions

1. **假设**：用户已通过之前的会话完整实现了图像工作室功能（探索确认所有文件存在且集成就位）
2. **决策**：保留独立页面位置，不做位置重构
3. **决策**：衔接主流程的增强作为可选下一步，不纳入本次方案必须实施范围
4. **约束**：所有现有文件均 ≤ 300 行（最大 image-studio.css 256 行），符合用户的硬约束

## Verification Steps

由于本方案为位置决策确认，无代码改动，验证步骤聚焦于确认现有实现可用：

1. **后端路由可达性**
   ```powershell
   cd d:\GitHubProgram\Qhyh_Agent\qinghe-video
   py -3 -c "from fastapi.testclient import TestClient; from src.main import app; c = TestClient(app); print('health:', c.get('/api/image-studio/health').status_code); print('generate:', c.post('/api/image-studio/generate').status_code)"
   ```
   预期：两个端点均返回 401（鉴权失败=路由存在且受保护）

2. **前端导航可达性**
   - 启动服务：`uvicorn src.main:app --host 0.0.0.0 --port 18739 --reload`
   - 访问 `http://localhost:18739/#/image-studio`
   - 确认顶部导航「图像工作室」高亮，页面显示素材上传表单

3. **单元测试无回归**
   ```powershell
   cd d:\GitHubProgram\Qhyh_Agent\qinghe-video
   py -3 -m pytest tests/ -v
   ```
   预期：所有测试通过（之前为 19 passed）

4. **文件行数约束**
   ```powershell
   cd d:\GitHubProgram\Qhyh_Agent\qinghe-video
   Get-ChildItem -Recurse -Include *.py,*.js,*.css,*.md src\image_studio, src\prompts\image_studio_director_board.md, frontend\assets\js\image-studio.js, frontend\assets\css\image-studio.css | ForEach-Object { "{0,4}  {1}" -f (Get-Content $_.FullName | Measure-Object -Line).Lines, $_.FullName }
   ```
   预期：所有文件 ≤ 300 行
