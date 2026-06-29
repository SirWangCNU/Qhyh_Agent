# 「我的资产」功能实现计划

## 一、设计思路（先分析再编码）

### 1.1 核心问题拆解
用户需要把"用户生成任务的相关图片/视频等"持久化保存，并按"来源模块/任务类型"分类展示。
拆解为两个子问题：
1. **资产从哪来** → 两类来源：① 现有各生成模块（video_mvp / video_compose / tts / image_studio / consistency / image_gen）成功后自动落库；② 用户手动上传文件。
2. **资产怎么管** → 统一的 `assets` 表 + 独立 `src/assets/` 模块（仿 `image_studio/` 模式）提供增删查 API，前端按 `source` 分组展示。

### 1.2 为什么这样设计
- **复用 `image_studio/` 模块化模板**：项目已有 `image_studio/`（5 文件）和 `consistency_images/`（5 文件）两个同构独立模块作为标准样板，新建 `src/assets/` 完全遵循该模式（`__init__.py` 暴露 router + `router.py` + `service.py` + `models.py`），不破坏现有架构。
- **统一 `Asset` 表而非多表**：各来源媒体字段高度同构（filename/url/path/size），用 `source` + `media_type` 两个维度字段区分即可，避免为每个模块建独立表带来的查询与维护负担。`source` 字段记录来源模块（落库时由调用方传入），`media_type` 记录文件类型（image/video/audio），二者正交，前端可分别按来源分组、按类型筛选。
- **落库调用而非事件总线**：现有 6 个生成端点都在路由层 return 前调用 `record_asset(...)`。这比引入事件机制简单，且每个端点已有 `_current_user` 可直接关联用户。改动局限在 return 前 1 行 + 注入 `db` 依赖，风险可控。
- **删资产级联删文件**：删除时同时删物理文件（硬删除），保持 DB 与磁盘一致。失败仅记日志不阻断响应（避免悬空记录）。
- **手动上传复用三段式保存**：参考现有媒体保存模式（mkdir → 时间戳命名 → write_bytes → 返回 `/outputs/upload/xxx`），新设 `outputs/upload/` 子目录并在 main.py 启动时创建。

### 1.3 数据模型设计
```
Asset 表
├── id            INTEGER PK
├── user_id       INTEGER FK → users.id（索引）
├── source        VARCHAR(32)  来源：video_mvp/video_compose/tts/image_studio/consistency/image_gen/upload
├── media_type    VARCHAR(16)  image/video/audio
├── filename      VARCHAR(255) 纯文件名
├── url           VARCHAR(512) /outputs/<subdir>/<filename>
├── file_path     VARCHAR(512) 服务端绝对路径
├── file_size     INTEGER      字节数（可空）
├── mime_type     VARCHAR(128) （可空）
├── title         VARCHAR(255) 展示标题（可空，上传时填，自动生成时用 subject）
├── meta_json     TEXT         扩展元数据 JSON（如 image_studio 的 variants、video_mvp 的 image_count）
├── created_at    DATETIME     default now
```

## 二、当前状态分析（Phase 1 探索结论）

### 2.1 后端现状
- 数据库：`src/db/models.py` 仅 `User` 一张表（SQLAlchemy 1.x `Column` 风格）；`src/db/database.py` 提供 `Base` / `get_db()` / 单例 engine。
- Alembic：`alembic/env.py` 已 `import src.db.models`，新表只需在该文件加模型类即可被 autogenerate 检测。`001_create_users_table.py` 是迁移样板。
- 模块化样板：`src/image_studio/`（`__init__.py` 暴露 `image_studio_router`，`main.py` 用 `app.include_router`）。
- 鉴权：所有业务端点 `Depends(get_current_user)` 拿 `User` 对象（含 `id` / `username`）。
- 媒体保存：统一三段式，落到 `outputs/{audio,video,image}/`，返回 `/outputs/<subdir>/<filename>`。
- 现有需落库的 6 个生成端点（均已确认返回结构与插入点）：
  | 端点 | 文件:行 | 返回字段 | source 值 | media_type |
  |---|---|---|---|---|
  | `POST /api/tts/generate` | main.py:218-246 | `audio_url` | tts | audio |
  | `POST /api/video/compose` | main.py:258-288 | `video_url` | video_compose | video |
  | `POST /api/video/mvp` | main.py:292-313 | `video_url`+`audio_url`+`image_count` | video_mvp | video（主）+audio（旁白） |
  | `POST /api/image-studio/generate` | image_studio/router.py:75-82 | `grid_url`+`variants[]` | image_studio | image（九宫格 + 9 变体） |
  | `POST /api/consistency-images/generate` | consistency_images/router.py:89-96 | `image_url` | consistency | image |
  | `POST /api/images/generate` | main.py:~180 | `images[]` | image_gen | image |

### 2.2 前端现状
- 顶部导航菜单定义在 `lib/constants.ts` 的 `NAV_LINKS`（与 `ROUTES` 对象），Header 通过 `NAV_LINKS.map()` 渲染。
- 路由：`routes/index.tsx` 用 `createHashRouter`，children 数组注册页面。
- 页面样板：`pages/AgentsPage.tsx`（完整业务，含状态机 + shadcn/ui + react-query mutation）。
- API 封装：`lib/api.ts` 的 `apiGet/apiPost/apiFetch` 自动注入 `Authorization: Bearer <token>`，401 自动 logout。
- hooks：react-query `useMutation` 包 `apiPost`（见 `hooks/use-agents.ts`）。
- 类型：`types/api.ts` 单一聚合文件，字段名与后端 snake_case 对齐。
- 全局 CSS 语义类：`container-app` / `module__head` / `eyebrow` / `section-title` / `section-desc`。

## 三、Proposed Changes（具体改动清单）

### 3.1 后端 — 新建 `src/assets/` 模块（4 文件）

#### 文件 1：`src/assets/models.py`（Pydantic 业务模型，~80 行）
- `AssetSource` Literal：`"video_mvp"|"video_compose"|"tts"|"image_studio"|"consistency"|"image_gen"|"upload"`
- `MediaType` Literal：`"image"|"video"|"audio"`
- `AssetResponse`（`from_attributes=True`，映射 ORM Asset）：id, user_id, source, media_type, filename, url, file_size, mime_type, title, meta_json(dict|None), created_at(datetime)
- `AssetListResponse`：items(list[AssetResponse]), total(int), page(int), page_size(int), source_filter(str|None), media_type_filter(str|None)
- `AssetStats`：source(str), count(int), total_size(int)
- `AssetUploadResponse`：复用 `AssetResponse`
- 所有模型 `ConfigDict(extra="forbid")`（除 `AssetResponse` 用 `from_attributes`）

#### 文件 2：`src/assets/service.py`（核心服务函数，~200 行）
纯数据库 + 文件系统操作，不依赖 FastAPI，可被其他脚本调用：
- `record_asset(db, user_id, *, source, media_type, url, file_path, filename, file_size=None, mime_type=None, title=None, meta=None) -> Asset`
  - 统一落库入口。自动从 `url` 推断 `media_type`/`filename`（若未传）。`meta` 序列化为 JSON 字符串存 `meta_json`。
  - **被现有 6 个生成端点和上传端点共用**，是"自动收集"的关键。
- `list_assets(db, user_id, *, source=None, media_type=None, page=1, page_size=20) -> tuple[list[Asset], int]`
  - 分页 + 双维度筛选，按 `created_at DESC` 排序。
- `get_asset(db, asset_id, user_id) -> Asset | None`
  - 校验归属（user_id 隔离，用户只能看自己的资产）。
- `delete_asset(db, asset_id, user_id) -> bool`
  - 先 `get_asset` 校验归属 → 删物理文件（`Path(file_path).unlink(missing_ok=True)`，失败仅 `logger.warning`）→ 删 DB 行 → commit。返回是否删除成功。
- `get_stats(db, user_id) -> list[AssetStats]`
  - `GROUP BY source` 聚合 count + sum(file_size)。
- `save_uploaded_file(file_bytes, content_type, original_name) -> tuple[str, str, str]`
  - 保存上传文件到 `outputs/upload/`，返回 `(url, file_path, filename)`。MIME 白名单校验（image/jpeg/png/webp/gif, video/mp4, audio/mpeg）。时间戳命名防冲突。
- 辅助 `_infer_media_type(url: str) -> MediaType`：按扩展名推断。

#### 文件 3：`src/assets/router.py`（FastAPI 路由，~150 行）
`APIRouter(tags=["assets"])`，全部 `Depends(get_current_user)` + `Depends(get_db)`：
- `GET /api/assets`：列表，query 参数 `source` / `media_type` / `page` / `page_size` → `AssetListResponse`
- `GET /api/assets/stats`：按来源统计 → `list[AssetStats]`
- `GET /api/assets/{asset_id}`：详情 → `AssetResponse`（404 if 不存在或不属于当前用户）
- `POST /api/assets/upload`：multipart 上传，`UploadFile=File(...)` + `title=Form(None)` + `source=Form("upload")` → 调 `save_uploaded_file` + `record_asset` → `AssetResponse`
- `DELETE /api/assets/{asset_id}`：调 `delete_asset` → `{"status":"deleted","id":id}`（404 if 不存在）
- 异常分层：`HTTPException` 透传 / `ValueError`→400 / 其他→500（沿用 image_studio 模式）

#### 文件 4：`src/assets/__init__.py`
```python
"""我的资产模块：用户生成媒体资产的持久化管理。
独立模块，不接入 LangGraph。提供：
- record_asset: 落库单条资产（被现有生成端点调用实现自动收集）
- list/get/delete_asset + get_stats: 资产 CRUD
- save_uploaded_file: 用户手动上传保存
- assets_router: FastAPI APIRouter
"""
from src.assets.router import router as assets_router
from src.assets.service import record_asset, list_assets, get_asset, delete_asset, get_stats, save_uploaded_file
__all__ = ["assets_router", "record_asset", "list_assets", "get_asset", "delete_asset", "get_stats", "save_uploaded_file"]
```

### 3.2 后端 — `src/db/models.py` 追加 `Asset` 模型（~30 行）
在 `User` 类后追加：
```python
from sqlalchemy import ForeignKey, Text
from sqlalchemy.orm import relationship

class Asset(Base):
    """用户资产模型（图片/视频/音频，按来源模块分类）。"""
    __tablename__ = "assets"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    source = Column(String(32), nullable=False, index=True)      # video_mvp/video_compose/tts/image_studio/consistency/image_gen/upload
    media_type = Column(String(16), nullable=False)             # image/video/audio
    filename = Column(String(255), nullable=False)
    url = Column(String(512), nullable=False)
    file_path = Column(String(512), nullable=False)
    file_size = Column(Integer, nullable=True)
    mime_type = Column(String(128), nullable=True)
    title = Column(String(255), nullable=True)
    meta_json = Column(Text, nullable=True)                     # JSON 字符串
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
```
（注意：不引入 `relationship` 到 User，保持与现有 User 模型风格一致——User 当前无关系字段，避免改 User 模型影响范围扩大。）

### 3.3 后端 — 新建 Alembic 迁移 `alembic/versions/002_create_assets_table.py`
手写迁移（避免 autogenerate 噪音），仿 `001` 结构：
- `revision = "002_assets"`，`down_revision = "001_initial"`
- `upgrade()`：`op.create_table("assets", ...)` + 索引（user_id, source, created_at）
- `downgrade()`：`op.drop_table("assets")`
- 无种子数据。

### 3.4 后端 — `src/main.py` 改动（~3 处）
1. 顶部 import：`from src.assets import assets_router, record_asset` + `from src.db.database import get_db` + `from sqlalchemy.orm import Session`
2. `app.include_router(assets_router)`（与其他 router 并列）
3. 启动时创建 `outputs/upload/` 目录：在 `_AUDIO_DIR` / `_VIDEO_DIR` 旁加 `_UPLOAD_DIR = _OUTPUTS_DIR / "upload"; _UPLOAD_DIR.mkdir(...)`

### 3.5 后端 — 在 6 个生成端点追加落库（每处 ~2 行）
统一模式：端点签名加 `db: Session = Depends(get_db)`（已有 `_current_user`），在 `return` 前调 `record_asset`。
- **main.py:218 tts/generate**：`record_asset(db, _current_user.id, source="tts", media_type="audio", url=audio_url, file_path=str(audio_path), filename=filename, mime_type="audio/mpeg")`
- **main.py:258 video/compose**：`record_asset(db, _current_user.id, source="video_compose", media_type="video", url=video_url, ...)`
- **main.py:292 video/mvp**：落库 video（主）+ audio（旁白）两条，meta 存 `{"image_count": image_count}`。需在 `run_video_mvp` 返回后拆出 url 再落库。
- **main.py:~180 images/generate**：循环对每张图 `record_asset(source="image_gen", media_type="image")`
- **image_studio/router.py:75**：落库九宫格图（source="image_studio", meta 存 variants URLs 数组）
- **consistency_images/router.py:89**：落库单图（source="consistency"）

落库失败不影响主流程：用 `try/except` 包裹，失败仅 `logger.warning("[assets] 落库失败 ...")`，**不** raise（避免资产功能故障拖垮现有生成功能）。

### 3.6 前端 — `lib/constants.ts`（~2 行）
- `ROUTES` 加 `assets: "/assets"`
- `NAV_LINKS` 加 `{ to: ROUTES.assets, label: "我的资产", route: ROUTES.assets }`

### 3.7 前端 — `routes/index.tsx`（~2 行）
import `AssetsPage` + 注册 `{ path: "assets", element: <AssetsPage /> }`

### 3.8 前端 — `types/api.ts`（~30 行）
新增分块：
```typescript
export type AssetSource = "video_mvp" | "video_compose" | "tts" | "image_studio" | "consistency" | "image_gen" | "upload";
export type AssetMediaType = "image" | "video" | "audio";
export interface Asset { id:number; user_id:number; source:AssetSource; media_type:AssetMediaType; filename:string; url:string; file_size:number|null; mime_type:string|null; title:string|null; meta_json:Record<string,unknown>|null; created_at:string; }
export interface AssetListResponse { items:Asset[]; total:number; page:number; page_size:number; source_filter:string|null; media_type_filter:string|null; }
export interface AssetStats { source:AssetSource; count:number; total_size:number; }
```

### 3.9 前端 — `hooks/use-assets.ts`（新建，~60 行）
- `useAssets(query)`：`useQuery` 调 `apiGet<AssetListResponse>("/api/assets", { params })`
- `useAssetStats()`：`useQuery` 调 `apiGet<AssetStats[]>("/api/assets/stats")`
- `useDeleteAsset()`：`useMutation` DELETE + `invalidateQueries(["assets"])`
- `useUploadAsset()`：`useMutation`，原生 `fetch` + `getAuthToken()`（FormData 走 apiFetch 例外路径，参考 `use-media.ts`）

### 3.10 前端 — `pages/AssetsPage.tsx`（主页面，~250 行）
参考 `AgentsPage.tsx` 结构：
- 头部：`module__head`（eyebrow "08 我的资产" + section-title + desc）
- 顶部统计栏：按 source 分组的 chip（显示来源名 + 数量），点击筛选
- 筛选区：source 下拉 + media_type 下拉 + 分页
- 资产网格：3-4 列响应式网格，每张 `AssetCard`
- 上传按钮：触发隐藏 `<input type=file>` 选择后上传
- 空状态 / loading skeleton / error 状态

### 3.11 前端 — `components/assets/`（拆分子组件，每个 < 500 行）
- `AssetCard.tsx`（~80 行）：单卡片，缩略图（图用 `<img>` / 视频用 `<video>` / 音频用图标）+ 标题 + 来源 badge + 删除按钮 + 点击预览
- `AssetGrid.tsx`（~40 行）：网格容器，map AssetCard
- `AssetFilter.tsx`（~60 行）：source + media_type 筛选器
- `AssetPreviewModal.tsx`（~80 行）：模态预览大图/视频/音频播放器（用 shadcn Dialog 或自建）

### 3.12 测试 — `tests/test_assets.py`（新建，~180 行）
仿 `tests/test_auth.py` 模式：内存 SQLite + `StaticPool` + `app.dependency_overrides[get_db]` + 每测试重建表。
用例：
1. `test_record_asset_creates_row`：调 `record_asset` → 查库确认字段
2. `test_list_assets_pagination_and_filter`：插入 5 条 → 分页 + source 筛选
3. `test_list_assets_user_isolation`：两个用户资产互不可见
4. `test_get_asset_returns_none_for_other_user`：归属隔离
5. `test_delete_asset_removes_row_and_file`：插入 + 删 → DB 行消失 + 物理文件删除（用 tmp_path）
6. `test_get_stats_groups_by_source`：多来源插入 → 按 source 聚合
7. `test_save_uploaded_file_rejects_bad_mime`：非法 MIME 抛 ValueError
8. `test_assets_endpoints_require_auth`：无 token 调 `/api/assets` → 401
9. `test_assets_crud_via_api`：注册→登录→上传→列表→删除 全流程
10. `test_infer_media_type_by_extension`：`.mp4`→video / `.mp3`→audio / `.jpg`→image

## 四、Assumptions & Decisions（假设与决策）

| 决策点 | 选择 | 理由 |
|---|---|---|
| 资产表设计 | 单表 `assets` + source/media_type 双字段 | 字段同构，避免多表 |
| 是否加 User↔Asset relationship | 否 | User 模型当前无关系字段，最小改动 |
| 自动收集触发点 | 在路由层 return 前（非事件总线） | 简单、可控、每端点已有 user |
| 落库失败处理 | 仅 warning 日志，不阻断主流程 | 资产功能不应拖垮生成功能 |
| 删除策略 | 硬删除 + 级联删物理文件 | 保持 DB 与磁盘一致 |
| 手动上传目录 | `outputs/upload/` | 与现有 audio/video/image 子目录并列 |
| 上传大小限制 | 不在代码层强制（依赖 FastAPI/Uvicorn 默认） | 现有 image_studio 也未限制，保持一致 |
| 前端路由路径 | `/assets`（hash: `#/assets`） | 与现有 `/create` 等风格一致 |
| meta_json 存储 | TEXT 列存 JSON 字符串 | SQLite 无原生 JSON 类型 |
| 分页默认 | page=1, page_size=20 | 通用默认 |

## 五、Verification Steps（验证步骤）

### 5.1 后端验证
```bash
cd qinghe-video
pytest tests/test_assets.py -v          # 新测试全绿
pytest tests/ -v                          # 现有测试不回归（test_graph/test_auth）
alembic upgrade head                      # 迁移成功，assets 表创建
sqlite3 qinghe.db ".schema assets"        # 确认表结构
uvicorn src.main:app --port 18739 --reload # 启动无错
```
手动验证端点（curl，需先登录拿 token）：
```bash
# 上传
curl -X POST http://localhost:18739/api/assets/upload -H "Authorization: Bearer <token>" -F "file=@test.jpg" -F "title=测试图"
# 列表
curl "http://localhost:18739/api/assets?page=1&page_size=10" -H "Authorization: Bearer <token>"
# 统计
curl http://localhost:18739/api/assets/stats -H "Authorization: Bearer <token>"
# 删除
curl -X DELETE http://localhost:18739/api/assets/1 -H "Authorization: Bearer <token>"
# 触发自动收集：调一次 /api/tts/generate，再查 /api/assets 应多一条 source=tts
```

### 5.2 前端验证
```bash
cd qinghe-video/frontend
npm run lint                              # 无 lint 错误
npm run build                             # tsc -b 类型检查通过，dist 生成
npm run dev                               # 启动后访问 #/assets
```
浏览器手测：
1. 顶部导航出现「我的资产」入口
2. 点击进入 `/assets`，页面正常渲染
3. 上传一张图片 → 网格出现新卡片
4. 按 source 筛选生效
5. 点击卡片预览模态打开
6. 删除按钮 → 卡片消失 + 后端文件删除
7. 调一次 TTS/视频合成后回资产页，确认自动收集到了新资产
8. 切换用户 → 看不到对方资产（隔离）

### 5.3 模块化与代码量检查
- 每个新建文件 < 500 行（`AssetsPage.tsx` ~250 行最大，拆分组件后合规）
- `src/assets/service.py` 所有函数可被外部脚本直接 import 调用（满足"代码必须模块化，方便被其他脚本调用"约束）

## 六、文件改动清单总览

### 新建（12 文件）
- `src/assets/__init__.py`
- `src/assets/models.py`
- `src/assets/service.py`
- `src/assets/router.py`
- `alembic/versions/002_create_assets_table.py`
- `tests/test_assets.py`
- `frontend/src/pages/AssetsPage.tsx`
- `frontend/src/hooks/use-assets.ts`
- `frontend/src/components/assets/AssetCard.tsx`
- `frontend/src/components/assets/AssetGrid.tsx`
- `frontend/src/components/assets/AssetFilter.tsx`
- `frontend/src/components/assets/AssetPreviewModal.tsx`

### 修改（6 文件）
- `src/db/models.py`（+Asset 类 ~30 行）
- `src/main.py`（+import/include_router/+upload 目录/6 端点落库 ~20 行）
- `frontend/src/lib/constants.ts`（+ROUTES.assets +NAV_LINKS 项）
- `frontend/src/routes/index.tsx`（+import +路由项）
- `frontend/src/types/api.ts`（+Asset 相关类型 ~30 行）
- `.env.example`（无需改，无新配置项）
