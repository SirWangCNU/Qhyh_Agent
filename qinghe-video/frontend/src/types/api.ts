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
  planner_output?: PlannerOutput;
  copywriter_output?: CopywriterOutput;
  scriptwriter_output?: ScriptwriterOutput;
  visual_output?: VisualOutput;
  distributor_output?: DistributorOutput;
  final_report?: string;
  error?: string | null;
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

export interface CopywriterOutput {
  hook: HookSegment;
  body: BodySegment[];
  cta: HookSegment;
  full_script: string;
  estimated_duration_seconds: number;
  word_count: number;
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

export interface ScriptwriterOutput {
  title: string;
  total_duration_seconds: number;
  bgm_suggestion: BgmSuggestion;
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
// 图像工作室（multipart/form）
// ============================================================

export type ImageStudioImageType = "person" | "product";

export interface ImageStudioVariant {
  variant_id: number;
  dimension: string;
  dimension_label: string;
  prompt: string;
  negative_prompt?: string;
  image_url?: string;
  b64_json?: string;
  error?: string;
}

export interface ImageStudioResponse {
  status: string;
  grid_url?: string;
  consistency_key: string;
  subject: string;
  image_type: ImageStudioImageType;
  variants: ImageStudioVariant[];
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
