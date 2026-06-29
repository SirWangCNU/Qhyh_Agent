# 「我的资产」前端实现计划（续）

## 概述

本计划是 `my-assets-feature-plan.md` 的续篇。**后端 100% 已完成并验证通过**（Asset ORM、alembic 002 迁移、`src/assets/` 模块 4 文件、main.py + image_studio + consistency_images 落库集成、14 个测试全绿）。前端基础层（`constants.ts` 导航、`types/api.ts` 类型、`use-assets.ts` hooks）也已完成。

**本计划只覆盖剩余的前端 UI 层**：5 个新建组件/页面文件 + 1 个路由注册修改。

---

## 一、当前状态（Phase 1 探索结论）

### 已完成 ✅
| 文件 | 状态 | 关键内容 |
|---|---|---|
| `src/assets/{__init__,models,service,router}.py` | ✅ | 5 端点 + record_asset 服务函数 |
| `alembic/versions/002_create_assets_table.py` | ✅ | 迁移已应用 |
| `src/db/models.py` | ✅ | Asset ORM 已加 |
| `src/main.py` | ✅ | assets_router 已注册，4 端点已落库 |
| `src/image_studio/router.py` + `src/consistency_images/router.py` | ✅ | 已落库 |
| `tests/test_assets.py` | ✅ | 14 测试全绿 |
| `frontend/src/lib/constants.ts` | ✅ | ROUTES.assets="/assets" + NAV_LINKS 已含「我的资产」 |
| `frontend/src/types/api.ts` | ✅ | Asset/AssetSource/ASSET_SOURCE_LABELS 等类型齐备 |
| `frontend/src/hooks/use-assets.ts` | ✅ | useAssets/useAssetStats/useDeleteAsset/useUploadAsset |

### 待实现 ❌
| 文件 | 状态 | 说明 |
|---|---|---|
| `frontend/src/components/assets/AssetCard.tsx` | ❌ | 单卡片组件 |
| `frontend/src/components/assets/AssetGrid.tsx` | ❌ | 网格容器 |
| `frontend/src/components/assets/AssetFilter.tsx` | ❌ | 筛选器（source chips + media_type） |
| `frontend/src/components/assets/AssetPreviewModal.tsx` | ❌ | 预览模态 |
| `frontend/src/pages/AssetsPage.tsx` | ❌ | 主页面 |
| `frontend/src/routes/index.tsx` | ❌ | 路由未注册（点「我的资产」落到 `*` 通配重定向到 /create） |

---

## 二、设计依据（从现有代码提取的模式）

### 2.1 页面头部样式（来自 AgentsPage/ImageStudioPage）
```tsx
<section className="container-app py-10">
  <div className="module__head">
    <span className="eyebrow"><span className="num">07</span>我的资产</span>
    <h2 className="section-title">...</h2>
    <p className="section-desc">...</p>
  </div>
  ...
</section>
```

### 2.2 媒体 URL 补全
后端返回相对 URL（如 `/outputs/upload/xxx.jpg`），必须用 `resolveMediaUrl` 补全：
```tsx
import { resolveMediaUrl } from "@/hooks/use-agents";
// resolveMediaUrl(url) → "http://host:18739/outputs/..." 或 null
```

### 2.3 可用 shadcn 组件
- `Button`（variants: default/outline/secondary/ghost/destructive/link；sizes: default/sm/lg/icon）
- `Badge`（variants: default/secondary/destructive/outline/success/warn）
- `Dialog`（基于 @radix-ui/react-dialog，含 DialogContent/DialogHeader/DialogTitle/DialogDescription，自带 X 关闭按钮 + 遮罩 + 动画）
- `Skeleton`（loading 占位）
- `Input`（用于上传标题输入）

### 2.4 动画
项目用 `framer-motion`：`motion.div` + `layout` + `initial={{opacity:0,y:8}}` + `animate={{opacity:1,y:0}}`。卡片入场动画用 `transition={{delay: idx*0.04 }}`。

### 2.5 类型与常量
- `AssetSource`、`AssetMediaType`、`Asset`、`AssetListResponse`、`AssetStats` 来自 `@/types/api`
- `ASSET_SOURCE_LABELS`（Record<AssetSource, string>）提供中文标签：一键成片/视频合成/TTS 配音/图像工作室/一致性生图/图片生成/手动上传
- `useAssets`/`useAssetStats`/`useDeleteAsset`/`useUploadAsset` 来自 `@/hooks/use-assets`

### 2.6 文件大小限制
用户当前为"我的资产"做上传，参考 ImageStudioPage 的 10MB 图片上限。但 assets 后端支持 image/video/audio 三类，统一限制为 **50MB**（视频/音频通常较大），图片复用同一通道。

---

## 三、Proposed Changes（具体改动清单）

### 3.1 新建 `frontend/src/components/assets/AssetCard.tsx`（~120 行）

**职责**：单资产卡片渲染。

**Props**：
```tsx
interface AssetCardProps {
  asset: Asset;
  index: number;       // 用于入场动画 delay
  onDelete: (id: number) => void;
  onPreview: (asset: Asset) => void;
  deletingId?: number | null;  // 正在删除的 id，用于禁用按钮
}
```

**渲染逻辑**：
- 缩略图区（`aspect-square`，`bg-secondary/30`）：
  - `media_type === "image"` → `<img src={resolveMediaUrl(asset.url) ?? undefined} loading="lazy" />`，`object-cover`
  - `media_type === "video"` → `<video src={...} />` 显示第一帧（`preload="metadata"`），叠加播放图标
  - `media_type === "audio"` → 居中显示 `Music` 图标（lucide-react）+ 音频波形装饰
- 标题区：`asset.title ?? asset.filename`（截断 `truncate`）
- 元信息行：`ASSET_SOURCE_LABELS[asset.source]` Badge + `formatBytes(file_size)` + `formatAssetDate(created_at)`
- 删除按钮：右上角悬浮 `Trash2` 图标，`window.confirm` 二次确认后调 `onDelete`
- 点击卡片（非删除按钮区域）→ `onPreview(asset)`

**导出辅助函数**（供 Modal 复用）：
```tsx
export function formatBytes(bytes: number | null | undefined): string;  // 1024 → "1.0 KB"
export function formatAssetDate(iso: string): string;  // "2026-06-29T10:00:00" → "06-29 10:00"
```

### 3.2 新建 `frontend/src/components/assets/AssetGrid.tsx`（~50 行）

**职责**：网格容器，map AssetCard。

**Props**：
```tsx
interface AssetGridProps {
  assets: Asset[];
  onDelete: (id: number) => void;
  onPreview: (asset: Asset) => void;
  deletingId?: number | null;
}
```

**渲染**：`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3`，每个 AssetCard 用 `motion.div` 包裹做 staggered 入场。

### 3.3 新建 `frontend/src/components/assets/AssetFilter.tsx`（~90 行）

**职责**：来源 chips（带统计）+ 媒体类型筛选。

**Props**：
```tsx
interface AssetFilterProps {
  selectedSource: AssetSource | "";
  selectedMediaType: AssetMediaType | "";
  stats: AssetStats[] | undefined;
  onSourceChange: (s: AssetSource | "") => void;
  onMediaTypeChange: (m: AssetMediaType | "") => void;
}
```

**渲染**：
- **来源 chips 行**：遍历 7 个 AssetSource 值，每个渲染一个可点击 Button（variant 切换 outline↔default）。chip 显示：`ASSET_SOURCE_LABELS[source]` + 统计数量（从 stats 查找，无则显示 0）。再加一个"全部"chip（selectedSource === "" 时高亮）。
- **媒体类型行**：4 个小按钮（全部/image/video/audio），用 lucide 图标（ImageIcon/Video/Music）+ 文字。

**布局**：垂直排列两个 flex-wrap 行，每行用 `gap-2`。

### 3.4 新建 `frontend/src/components/assets/AssetPreviewModal.tsx`（~110 行）

**职责**：全屏模态预览单资产。

**Props**：
```tsx
interface AssetPreviewModalProps {
  asset: Asset | null;   // null = 关闭
  onClose: () => void;
}
```

**实现**：用 shadcn `Dialog`（`open={asset !== null}`，`onOpenChange` → 关闭时调 onClose）。
- `DialogContent` 加 `className="max-w-3xl"` 放大宽度
- 媒体渲染区（居中，最大高度 70vh）：
  - image → `<img className="max-h-[60vh] object-contain" />`
  - video → `<video controls className="max-h-[60vh]" />`
  - audio → `<audio controls />` + 大图标装饰
- 元信息区（`DialogHeader` 下）：
  - `DialogTitle`：`asset.title ?? asset.filename`
  - 来源 Badge + 媒体类型 + 文件大小 + 创建时间
  - `meta_json` 展开（若有，用 `<pre>` 显示 JSON，`max-h-32 overflow-auto`）
- 底部下载按钮：`<a href={resolveMediaUrl(url)} download target="_blank">` + Button outline

**注意**：shadcn Dialog 已自带 X 关闭按钮和 ESC 关闭，无需额外实现。

### 3.5 新建 `frontend/src/pages/AssetsPage.tsx`（~220 行）

**职责**：主页面，组合上述组件。

**状态**：
```tsx
const [selectedSource, setSelectedSource] = useState<AssetSource | "">("");
const [selectedMediaType, setSelectedMediaType] = useState<AssetMediaType | "">("");
const [page, setPage] = useState(1);
const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
const [uploadTitle, setUploadTitle] = useState("");
const fileInputRef = useRef<HTMLInputElement>(null);
```

**Hooks 调用**：
```tsx
const statsQ = useAssetStats();
const listQ = useAssets({ source: selectedSource, media_type: selectedMediaType, page, page_size: 20 });
const delMut = useDeleteAsset();
const upMut = useUploadAsset();
```

**布局**：
1. `module__head`（eyebrow "07 我的资产" + title "我的资产" + desc "管理生成与上传的图片、视频、音频素材"）
2. **上传区**（一行）：Button「上传资产」+ 可选标题 Input + 隐藏 `<input type="file" accept="image/*,video/*,audio/*">`，选择文件后立即触发 `upMut.mutateAsync`，成功 toast + 清空标题
3. `AssetFilter`（stats + 双维度筛选）
4. **资产网格区**：
   - loading → Skeleton 网格（8 个 `aspect-square` Skeleton）
   - error → 错误提示卡片 + 重试按钮
   - 空数据 → 空状态（`PackageOpen` 图标 + 文案"还没有资产，去生成或上传吧"）
   - 有数据 → `<AssetGrid assets={items} ... />`
5. **分页**：`total > page_size` 时显示「上一页 / 第 X/Y 页 / 下一页」按钮组
6. `AssetPreviewModal`（绑定 previewAsset）

**交互细节**：
- 切换 source/media_type 筛选时 `setPage(1)` 重置页码
- 删除确认用 `window.confirm("确定删除该资产？删除后文件不可恢复。")`
- 删除成功后若当前页变空且 page > 1，自动 `setPage(p => Math.max(1, p-1))`

### 3.6 修改 `frontend/src/routes/index.tsx`（+2 行）

在 import 区加：
```tsx
import { AssetsPage } from "@/pages/AssetsPage";
```
在 children 数组（`{ path: "plan", ... }` 后）加：
```tsx
{ path: "assets", element: <AssetsPage /> },
```

---

## 四、模块化与代码量检查

| 文件 | 预估行数 | < 500 行 |
|---|---|---|
| AssetCard.tsx | ~120 | ✅ |
| AssetGrid.tsx | ~50 | ✅ |
| AssetFilter.tsx | ~90 | ✅ |
| AssetPreviewModal.tsx | ~110 | ✅ |
| AssetsPage.tsx | ~220 | ✅ |

所有文件均远低于 500 行上限。组件间通过 props 解耦，AssetsPage 是唯一持有状态的容器，子组件均为纯展示/受控组件，可独立复用。

---

## 五、Assumptions & Decisions（假设与决策）

| 决策点 | 选择 | 理由 |
|---|---|---|
| 上传文件大小限制 | 50MB | 兼容视频/音频，前端校验 + 后端默认 |
| 缩略图渲染 | image→img / video→video(metadata) / audio→图标 | 复用现有 ImageStudioPage 的 object-cover 模式 |
| 预览模态 | shadcn Dialog（max-w-3xl） | 项目已有 Dialog 组件，自带 ESC/遮罩关闭 |
| 删除确认 | window.confirm | 简单可靠，与项目其他删除操作一致 |
| 分页 | page_size=20 固定 | 与后端默认一致 |
| 卡片入场动画 | framer-motion staggered | 与 AgentsPage/ImageStudioPage 一致 |
| 空状态图标 | PackageOpen (lucide) | 语义贴合"资产" |
| 上传标题 | 可选，不强制 | 与 image_studio 上传体验一致 |

---

## 六、Verification Steps（验证步骤）

### 6.1 类型检查与构建
```bash
cd qinghe-video/frontend
npm run lint        # 无 lint 错误
npm run build       # tsc -b 类型检查通过，dist 生成
```

### 6.2 浏览器手测
1. `npm run dev` 启动后访问 `/#/assets`
2. 顶部导航「我的资产」高亮，页面正常渲染
3. 空状态正确显示
4. 上传一张图片 → 网格出现新卡片
5. 按 source chip 筛选 → 列表刷新
6. 按 media_type 筛选 → 列表刷新
7. 点击卡片 → 模态预览打开，图/视频/音频正确渲染
8. ESC / 点击遮罩 / X 按钮 → 模态关闭
9. 删除按钮 → 确认后卡片消失
10. 分页：构造 >20 条资产测试翻页
11. 调一次 TTS 生成后回资产页 → 自动收集到 source=tts 的资产
12. 切换用户 → 看不到对方资产（隔离）

### 6.3 回归
- 确认其他页面（/create /chat /workshop /image-studio /agents /plan）路由仍正常
- 确认后端 `pytest tests/ -v` 仍 44 测试全绿（前端改动不影响后端）

---

## 七、文件改动清单总览

### 新建（5 文件）
- `frontend/src/components/assets/AssetCard.tsx`
- `frontend/src/components/assets/AssetGrid.tsx`
- `frontend/src/components/assets/AssetFilter.tsx`
- `frontend/src/components/assets/AssetPreviewModal.tsx`
- `frontend/src/pages/AssetsPage.tsx`

### 修改（1 文件）
- `frontend/src/routes/index.tsx`（+import AssetsPage +路由项）

### 不改动
- 后端所有文件（已完成）
- `constants.ts` / `types/api.ts` / `use-assets.ts`（已完成）
