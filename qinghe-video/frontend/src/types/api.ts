/**
 * 后端 API 类型定义。
 * 字段名严格对齐后端 src/models.py 与 src/state.py，便于 JSON 直接映射。
 */

/** 用户输入（POST /api/generate 与 /api/generate/stream 的请求体）。 */
export interface UserInput {
  product_name: string;
  origin: string;
  category: string;
  selling_points: string;
  target_platform?: string;
  target_duration?: string;
  additional_info?: string;
}

/** 鉴权响应（POST /api/auth/login）。 */
export interface AuthResponse {
  access_token: string;
  token_type: string;
  username: string;
  role: string;
}

/** 健康检查响应（GET /api/health）。 */
export interface HealthResponse {
  status: string;
  service: string;
  version: string;
}

// ============================================================
// 我的资产（/api/assets）
// ============================================================

/** 资产来源模块（与后端 src/assets/models.py AssetSource 对齐）。 */
export type AssetSource =
  | "video_mvp"
  | "video_compose"
  | "tts"
  | "image_studio"
  | "consistency"
  | "image_gen"
  | "image_edit"
  | "canvas"
  | "upload";

/** 媒体类型。 */
export type AssetMediaType = "image" | "video" | "audio";

/** 单条资产（GET /api/assets/{id} 或列表项）。 */
export interface Asset {
  id: number;
  user_id: number;
  source: AssetSource;
  media_type: AssetMediaType;
  filename: string;
  url: string;
  file_size: number | null;
  mime_type: string | null;
  title: string | null;
  meta_json: Record<string, unknown> | null;
  created_at: string;
}

/** 资产列表分页响应（GET /api/assets）。 */
export interface AssetListResponse {
  items: Asset[];
  total: number;
  page: number;
  page_size: number;
  source_filter: string | null;
  media_type_filter: string | null;
}

/** 按来源模块聚合的统计项（GET /api/assets/stats）。 */
export interface AssetStats {
  source: AssetSource;
  count: number;
  total_size: number;
}

/** 删除资产响应（DELETE /api/assets/{id}）。 */
export interface AssetDeleteResponse {
  status: string;
  id: number;
}

/** 来源模块的中文展示名（前端筛选用）。 */
export const ASSET_SOURCE_LABELS: Record<AssetSource, string> = {
  video_mvp: "一键成片",
  video_compose: "视频合成",
  tts: "TTS 配音",
  image_studio: "图像工作室",
  consistency: "一致性生图",
  image_gen: "图片生成",
  image_edit: "图片编辑",
  canvas: "无限画布",
  upload: "手动上传",
};

/** 单个爆款主题候选。字段与后端 TopicCandidate 严格对齐。 */
export interface TopicCandidate {
  theme: string;
  creative_angle: string;
  pain_point: string;
  target_audience: string;
  traffic_hook: string;
  appeal_reason: string;
}

/** SSE 事件联合类型。 */
export type SSEEvent =
  | { event: "start"; data: { task_id: string; nodes: string[] } }
  | { event: "node_start"; data: { node: string; task_id: string } }
  | {
      event: "node_update";
      data: { node: string; output: Record<string, unknown>; task_id: string };
    }
  | {
      event: "error";
      data: { node?: string; error: string; task_id: string };
    }
  | {
      event: "complete";
      data: {
        task_id: string;
        status: "success" | "error";
        result: GenerateResult;
      };
    };

/** 完整生成结果（pipeline 累计 state）。 */
export interface GenerateResult {
  selected_topic?: TopicCandidate;
  planner_output?: PlannerOutput;
  copywriter_output?: CopywriterOutput;
  scriptwriter_output?: ScriptwriterOutput;
  visual_output?: VisualOutput;
  distributor_output?: DistributorOutput;
  final_report?: string;
  error?: string | null;
  /** 工坊第 3 步建立的一致性参考（人物/物品/场景主体描述），注入 visual_designer */
  consistency_references?: ConsistencyReferences;
}

/** 一致性参考主体描述（仅存文本，不存 url）。键为类型，值为 subject 描述。 */
export interface ConsistencyReferences {
  character?: string;
  object?: string;
  scene?: string;
}

// ============================================================
// Agent 输出模型（对齐 src/models.py，所有 ConfigDict(extra="forbid")）
// ============================================================

export interface TargetAudience {
  age_range: string;
  region: string;
  consumer_profile: string;
}

export interface PlannerOutput {
  theme: string;
  core_selling_points: string[];
  target_audience: TargetAudience;
  emotion_tone: string;
  creative_angle: string;
  video_type:
    | "原产地溯源"
    | "种植过程"
    | "美食制作"
    | "对比测评"
    | "生活方式";
  strategy_notes?: string | null;
}

export interface HookSegment {
  text: string;
  delivery_note: string;
}

export interface BodySegment {
  segment: number;
  text: string;
  delivery_note: string;
}

export interface ConsistencyPlan {
  character_subject?: string;
  object_subject?: string;
  scene_subject?: string;
  style_preference?: string;
}

export interface CopywriterOutput {
  hook: HookSegment;
  body: BodySegment[];
  cta: HookSegment;
  full_script: string;
  estimated_duration_seconds: number;
  word_count: number;
  consistency_plan?: ConsistencyPlan;
}

export interface BgmSuggestion {
  style: string;
  bpm_range: string;
  mood: string;
  reference: string;
}

export interface Shot {
  shot_id: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  shot_type: string;
  camera_movement: string;
  visual_description: string;
  voiceover: string;
  text_overlay?: string;
  sound_effects?: string;
  transition?: string;
}

export interface StorySegment {
  segment_id: number;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  shots: Shot[];
  storyboard_text: string;
  /** 该片段导演板图 URL（用户在工坊手动触发生成，旧会话可能缺失） */
  storyboard_board_image_url?: string;
}

export interface ScriptwriterOutput {
  title: string;
  total_duration_seconds: number;
  bgm_suggestion: BgmSuggestion;
  /** ≤15s 故事板片段列表；旧会话可能缺失，回退到 shots 平铺视图 */
  segments?: StorySegment[];
  /** 所有片段镜头的平铺视图（向后兼容 visual_designer / 画布导出） */
  shots: Shot[];
  production_notes: string;
}

export interface VisualStyle {
  style: string;
  /** 后端为逗号分隔字符串，前端用 toArray() 兼容 */
  color_palette: string[] | string;
  aspect_ratio: string;
  /** 后端为逗号分隔字符串，前端用 toArray() 兼容 */
  quality_tags: string[] | string;
}

export interface ShotPrompt {
  shot_id: string;
  prompt: string;
  negative_prompt: string;
  recommended_tool: string;
  aspect_ratio: string;
  reference_style: string;
}

export interface VisualOutput {
  visual_style: VisualStyle;
  shot_prompts: ShotPrompt[];
  consistency_guide: string;
}

export interface VideoSpecs {
  resolution: string;
  aspect_ratio: string;
  max_duration: string;
  file_format: string;
  fps: string;
}

export interface PublishContent {
  title: string;
  description: string;
  hashtags: string[];
  mention?: string;
}

export interface PublishStrategy {
  best_time: string;
  best_days: string[];
  frequency: string;
  first_comment?: string;
}

export interface PromotionSuggestion {
  type: string;
  description: string;
  budget_hint?: string;
}

export interface DistributorOutput {
  platform: string;
  video_specs: VideoSpecs;
  publish_content: PublishContent;
  publish_strategy: PublishStrategy;
  promotion_suggestions: PromotionSuggestion[];
  platform_specific_notes: string;
}

// ============================================================
// 单步 Agent API（POST /api/agents/{step}）
// ============================================================

export interface AgentStepRequest {
  input: UserInput;
  state: Partial<GenerateResult>;
  selected_topic?: TopicCandidate | null;
}

export interface AgentStepResponse {
  status: "success" | "error";
  step: string;
  label: string;
  output_key:
    | "planner_output"
    | "copywriter_output"
    | "scriptwriter_output"
    | "visual_output"
    | "distributor_output"
    | "final_report";
  output: unknown;
  state: GenerateResult;
  error?: string;
}

// ============================================================
// 素材生成 API
// ============================================================

export interface ImageGenerationRequest {
  prompt: string;
  negative_prompt?: string;
  size?: string;
  n?: number;
  /** 可选参考图路径（/outputs/image/xxx.jpg），存在则走图生图。 */
  reference_image_path?: string;
  /** 资产标题，未指定时取 prompt 前 80 字符 */
  title?: string;
}

export interface EditImageGenerationRequest {
  prompt: string;
  size?: string;
  aspect_ratio?: string;
  n?: number;
  model?: string;
  image?: string[];
  watermark?: boolean;
  /** 资产标题，未指定时取 prompt 前 80 字符 */
  title?: string;
}

export interface GeneratedImage {
  url?: string;
  b64_json?: string;
  size?: string;
  revised_prompt?: string;
}

export interface ImageGenerationResponse {
  status: string;
  model: string;
  size: string;
  images: GeneratedImage[];
}

export interface TTSRequest {
  text: string;
  filename?: string;
}

export interface TTSResponse {
  status: string;
  audio_path: string;
  audio_url: string;
}

export interface VideoComposeRequest {
  image_urls: string[];
  audio_path: string;
  filename?: string;
}

export interface VideoComposeResponse {
  status: string;
  video_path: string;
  video_url: string;
}

export interface VideoMvpRequest {
  state: GenerateResult;
  text?: string;
}

export interface VideoMvpResponse {
  status: string;
  task_id: string;
  video_url: string;
  audio_url: string;
  image_count: number;
  duration_estimate: string;
}

// ============================================================
// 一致性生图（人物/物品/场景，multipart/form，参考图可选）
// ============================================================

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

/** 工坊 mediaResults 中单类一致性图的状态槽。 */
export interface ConsistencyImageSlot {
  url: string;
  prompt: string;
  mode: ConsistencyMode;
  status: "loading" | "done" | "error";
  error?: string;
}

// ============================================================
// 方案历史（LocalStorage）
// ============================================================

export type ChatMessageRole = "user" | "assistant";
export type ChatMessageType = "text" | "loading" | "agent" | "compose" | "video";

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  type: ChatMessageType;
  content: string;
  meta?: Record<string, unknown>;
  ts: number;
}

export interface Plan {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  taskId?: string;
  messages?: ChatMessage[];
  state?: GenerateResult;
}

// ============================================================
// AI 一句话润写 API（POST /api/text/polish）
// ============================================================

/** AI 润写请求（POST /api/text/polish）。 */
export interface PolishRequest {
  product_name: string;
  one_liner: string;
}

/** AI 润写响应。 */
export interface PolishResponse {
  status: string;
  input: UserInput;
}

// ============================================================
// AI 爆款选题 API（POST /api/topics/generate）
// ============================================================

/** AI 选题请求（POST /api/topics/generate）。 */
export interface TopicRequest {
  product_name: string;
  one_liner: string;
  target_platform?: string;
  count?: number;
}

/** AI 选题响应。 */
export interface TopicResponse {
  status: string;
  topics: TopicCandidate[];
}

// ============================================================
// 故事板（Storyboard）— 工坊 → 画布 导入 payload 与画布 API
// ============================================================

/** 工坊导出的单个分镜数据（以 scriptwriter.shots 为基准，存在 visual_output 时取其 shot_prompts）。 */
export interface StoryboardShot {
  shot_id: string;
  title: string;
  visual_prompt: string;
  narration: string;
  duration: number;
  /** 用户在画布上为该 shot 绑定的参考图 URL（可选）。 */
  reference_image_url?: string;
  reference_type?: "character" | "object" | "scene";
}

/** 工坊导出的单个段级故事板数据（04b 故事板文本，本次导出主载荷）。 */
export interface SegmentPayloadDTO {
  segment_id: string;
  title: string;
  /** 04b 故事板文本（由后端 scriptwriter 节点填充）。 */
  storyboard_text: string;
}

/** 工坊 → 画布的完整故事板 payload。 */
export interface StoryboardPayload {
  /** 段级故事板数据（04b 故事板文本，本次导出主载荷）。 */
  segments?: SegmentPayloadDTO[];
  /** shot 级分镜数据（保留向后兼容，默认不导出）。 */
  shots?: StoryboardShot[];
  /** 人物/物品/场景一致性参考图 URL（来自工坊第 3 步）。 */
  character_ref?: string;
  object_ref?: string;
  scene_ref?: string;
  /** 整体旁白文本（来自 copywriter.full_script）。 */
  voiceover_text?: string;
  /** 段级导演板系统提示词（默认前端 STORYBOARD_BOARD_PROMPT）。 */
  systemPrompt?: string;
}

/** 后端 ShotInput（与 src/canvas/models.py 对齐）。 */
export interface ShotInputDTO {
  shot_id: string;
  title: string;
  visual_prompt: string;
  narration: string;
  duration: number;
  reference_image_url?: string;
  reference_type?: "character" | "object" | "scene";
  node_id?: string;
}

/** POST /api/canvas/projects/{id}/storyboard/generate 请求体。 */
export interface StoryboardGenerateRequestDTO {
  shots: ShotInputDTO[];
  character_ref?: string;
  object_ref?: string;
  scene_ref?: string;
  size?: string;
  model?: string;
  concurrency?: number;
}

/** 后端 GenerateResult（与单生成节点共用）。 */
export interface StoryboardShotResultDTO {
  node_id: string;
  status: "idle" | "running" | "done" | "error";
  result_image_url: string | null;
  error: string | null;
}

/** POST /api/canvas/projects/{id}/storyboard/generate 响应。 */
export interface StoryboardGenerateResponseDTO {
  results: StoryboardShotResultDTO[];
}

// ============================================================
// 段级故事板（Segment-level Director Board）DTO
// 与 src/canvas/models.py 的 SegmentInput / SegmentGenerate* 对齐
// ============================================================

/** 后端 SegmentInput。 */
export interface SegmentInputDTO {
  segment_id: string;
  /** 04b 故事板文本。 */
  storyboard_text: string;
  /** 段级导演板系统提示词；未传则用后端默认 STORYBOARD_BOARD_PROMPT。 */
  system_prompt?: string;
  title: string;
  /** 前端 StoryboardSegmentNode 节点 id，用于回写状态与结果图。 */
  node_id?: string;
}

/** POST /api/canvas/projects/{id}/storyboard/segment-generate 请求体。 */
export interface SegmentGenerateRequestDTO {
  segments: SegmentInputDTO[];
  character_ref?: string;
  object_ref?: string;
  scene_ref?: string;
  size?: string;
  model?: string;
  concurrency?: number;
}

/** 后端 SegmentGenerateResult。 */
export interface SegmentGenerateResultDTO {
  node_id: string;
  status: "idle" | "running" | "done" | "error";
  result_image_url: string | null;
  error: string | null;
}

/** POST /api/canvas/projects/{id}/storyboard/segment-generate 响应。 */
export interface SegmentGenerateResponseDTO {
  results: SegmentGenerateResultDTO[];
}

/** 单个分镜的合成输入。 */
export interface ShotResultInputDTO {
  shot_id: string;
  image_url: string;
  narration: string;
  duration: number;
}

/** POST /api/canvas/projects/{id}/storyboard/compose 请求体。 */
export interface StoryboardComposeRequestDTO {
  shot_results: ShotResultInputDTO[];
  voiceover_text?: string;
}

/** POST /api/canvas/projects/{id}/storyboard/compose 响应。 */
export interface StoryboardComposeResponseDTO {
  status: string;
  video_url: string | null;
  audio_url: string | null;
  error: string | null;
}

// ============================================================
// 工坊会话（Workshop Sessions）—— 与后端 src/workshop_sessions 对齐
// ============================================================

/** 工坊会话状态快照（即 workshop-store 的 persist snapshot）。 */
export interface WorkshopSessionState {
  steps: Record<string, string>;
  stepOutputs: Record<string, unknown>;
  stepErrors: Record<string, string>;
  workshopState: GenerateResult;
  mediaResults: {
    characterImage: ConsistencyImageSlot | null;
    objectImage: ConsistencyImageSlot | null;
    sceneImage: ConsistencyImageSlot | null;
  };
  autoRunToStep: number;
  currentStep: string;
  form: UserInput;
  oneLiner: string;
  topics: TopicCandidate[];
  selectedTopicIndex: number | null;
  selectedTopic: TopicCandidate | null;
}

/** GET /api/workshop/sessions 列表项（不含 state，节省带宽）。 */
export interface WorkshopSessionSummaryDTO {
  id: string;
  name: string;
  /** 步骤进度摘要，如 "2/4"。 */
  step_progress: string;
  updated_at: string;
}

/** GET /api/workshop/sessions/{id} 完整会话。 */
export interface WorkshopSessionDTO {
  id: string;
  name: string;
  state: WorkshopSessionState;
  created_at: string;
  updated_at: string;
}

/** POST /api/workshop/sessions 请求体。 */
export interface WorkshopSessionCreateInput {
  name: string;
  state?: Partial<WorkshopSessionState>;
}

/** PUT /api/workshop/sessions/{id} 请求体。 */
export interface WorkshopSessionUpdateInput {
  name?: string;
  state?: Partial<WorkshopSessionState>;
}
