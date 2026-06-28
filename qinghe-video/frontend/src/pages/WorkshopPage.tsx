import { Play, Loader2, RotateCcw, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRunAgentStep } from "@/hooks/use-agents";
import { useTextPolish } from "@/hooks/use-text-polish";
import { useGenerateImage, useGenerateTTS, useComposeVideo } from "@/hooks/use-media";
import {
  WORKSHOP_STEPS,
  type WorkshopStepKey,
  type WorkshopStepConfig,
  type NodeKey,
} from "@/lib/constants";
import { useWorkshopStore } from "@/stores/workshop-store";
import { WorkshopStepList } from "@/components/workshop/WorkshopStepList";
import { WorkshopProgressBar } from "@/components/workshop/WorkshopProgressBar";
import type { CopywriterOutput } from "@/types/api";

/**
 * 分步 Agent 工坊（#/workshop）— Auto Video Agent 模式。
 *
 * Step1 极简输入嵌入 Step 1 卡片：产品名 + 一句话创意 → AI 润写 → 完整字段。
 * 8 步流水线以卡片网格平铺：策划→文案→脚本→视觉→投放→出图→配音→合成
 * 支持复选框自动批量执行 + 手动单步「运行此步」续跑。
 */
export function WorkshopPage() {
  const store = useWorkshopStore();

  // API hooks
  const runAgentStep = useRunAgentStep();
  const textPolish = useTextPolish();
  const generateImage = useGenerateImage();
  const generateTTS = useGenerateTTS();
  const composeVideo = useComposeVideo();

  /** 校验表单必填字段 */
  function validateForm(): string | null {
    const f = store.form;
    if (!f.product_name.trim()) return "请填写产品名称";
    if (!store.oneLiner.trim() && !f.selling_points.trim()) {
      return "请填写一句话创意或先点击 AI 润写";
    }
    // 润写后仍需 selling_points（planner 依赖）
    if (!f.selling_points.trim()) return "请先点击 AI 润写补全信息";
    return null;
  }

  /** 触发 AI 润写 */
  async function handlePolish(): Promise<void> {
    if (!store.form.product_name.trim()) {
      alert("请先填写产品名称");
      throw new Error("请先填写产品名称");
    }
    if (!store.oneLiner.trim()) {
      alert("请填写一句话创意");
      throw new Error("请填写一句话创意");
    }
    const resp = await textPolish.mutateAsync({
      product_name: store.form.product_name,
      one_liner: store.oneLiner,
    });
    store.setForm(resp.input);
  }

  /** 校验前置依赖步骤是否完成 */
  function validateDeps(cfg: WorkshopStepConfig): string | null {
    for (const dep of cfg.deps) {
      if (store.steps[dep] !== "done") {
        const depCfg = WORKSHOP_STEPS.find((s) => s.key === dep);
        return `请先完成「${depCfg?.title ?? dep}」步骤`;
      }
    }
    return null;
  }

  /** 从 copywriter_output 提取旁白文本 */
  function extractVoiceoverText(): string {
    const co = store.workshopState.copywriter_output as CopywriterOutput | undefined;
    if (co?.full_script) return co.full_script;
    if (co?.body?.length) {
      return co.body.map((b) => b.text).join("\n");
    }
    if (co?.hook?.text) return co.hook.text;
    return "";
  }

  /** 执行单个步骤（根据类型调用对应 API） */
  async function executeStep(key: WorkshopStepKey): Promise<boolean> {
    const cfg = WORKSHOP_STEPS.find((s) => s.key === key)!;

    // 校验前置依赖
    const depError = validateDeps(cfg);
    if (depError) {
      store.setStepError(key, depError);
      return false;
    }

    // 表单校验（仅 LLM 步骤需要）
    if (cfg.type === "llm") {
      const formError = validateForm();
      if (formError) {
        store.setStepError(key, formError);
        return false;
      }
    }

    store.clearStepError(key);
    store.setStepStatus(key, "running");
    store.setCurrentStep(key);
    store.setStepRunning(true);

    try {
      switch (cfg.type) {
        case "llm":
          await execLLMStep(key);
          break;
        case "image":
          await execImageGen();
          break;
        case "tts":
          await execTTS();
          break;
        case "compose":
          await execCompose();
          break;
      }
      store.setStepStatus(key, "done");
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      store.setStepError(key, msg);
      return false;
    } finally {
      store.setStepRunning(false);
    }
  }

  /** LLM Agent 步骤 */
  async function execLLMStep(key: WorkshopStepKey) {
    const resp = await runAgentStep.mutateAsync({
      step: key as NodeKey,
      input: store.form,
      state: store.workshopState,
    });
    if (resp.status === "error") {
      throw new Error(resp.error ?? `${key} 执行失败`);
    }
    store.setStepOutput(key, resp.output);
    store.setWorkshopState(resp.state);
  }

  /** 出图：逐镜生成图片 */
  async function execImageGen() {
    const shotPrompts = store.workshopState.visual_output?.shot_prompts ?? [];
    if (shotPrompts.length === 0) {
      throw new Error("视觉 Agent 未生成 shot_prompts");
    }
    const prompts = shotPrompts.slice(0, 4);

    // 初始化为 loading
    const initial: Array<{ url: string; prompt: string; status: "loading" | "done" | "error" }> =
      prompts.map((p) => ({
        url: "",
        prompt: p.prompt,
        status: "loading",
      }));
    store.setMediaResults({ images: initial });

    const results = [...initial];
    for (let i = 0; i < prompts.length; i++) {
      try {
        const resp = await generateImage.mutateAsync({
          prompt: prompts[i].prompt,
          negative_prompt: prompts[i].negative_prompt,
          size: "1920x1920",
          n: 1,
        });
        results[i] = {
          url: resp.images[0]?.url ?? "",
          prompt: prompts[i].prompt,
          status: "done",
        };
      } catch {
        results[i] = { url: "", prompt: prompts[i].prompt, status: "error" };
      }
      store.setMediaResults({ images: [...results] });
    }

    store.setStepOutput("image_gen", { count: results.length, images: results });
  }

  /** 配音：TTS 合成 */
  async function execTTS() {
    const text = extractVoiceoverText();
    if (!text) {
      throw new Error("文案 Agent 未生成旁白文本");
    }
    const resp = await generateTTS.mutateAsync({ text });
    store.setMediaResults({
      audioUrl: resp.audio_url,
      audioPath: resp.audio_path,
    });
    store.setStepOutput("tts", { audioUrl: resp.audio_url, text });
  }

  /** 合成：图片 + 配音 → 视频，完成后自动生成报告 */
  async function execCompose() {
    const imageUrls = store.mediaResults.images
      .filter((i) => i.status === "done" && i.url)
      .map((i) => i.url);
    const audioPath = store.mediaResults.audioPath;
    if (imageUrls.length === 0) throw new Error("请先完成「出图」步骤");
    if (!audioPath) throw new Error("请先完成「配音」步骤");

    const resp = await composeVideo.mutateAsync({
      image_urls: imageUrls,
      audio_path: audioPath,
    });
    store.setMediaResults({ videoUrl: resp.video_url });
    store.setStepOutput("compose", { videoUrl: resp.video_url });

    // 合成完成后自动生成报告（非阻塞）
    try {
      const reportResp = await runAgentStep.mutateAsync({
        step: "report_generator",
        input: store.form,
        state: store.workshopState,
      });
      if (reportResp.status === "success") {
        store.setWorkshopState(reportResp.state);
      }
    } catch {
      /* 报告生成失败不阻塞 */
    }
  }

  /** 自动执行：从第一个未完成步骤执行到 autoRunToStep */
  async function startAutoRun() {
    const formError = validateForm();
    if (formError) {
      alert(formError);
      return;
    }
    store.setAutoRunning(true);
    try {
      for (const cfg of WORKSHOP_STEPS) {
        if (cfg.num > store.autoRunToStep) break;
        if (store.steps[cfg.key] === "done") continue;
        const ok = await executeStep(cfg.key);
        if (!ok) break; // 失败则暂停
      }
    } finally {
      store.setAutoRunning(false);
    }
  }

  /** 手动下一步：执行下一个未完成步骤 */
  async function runNextStep() {
    const next = WORKSHOP_STEPS.find(
      (s) => store.steps[s.key] !== "done" && store.steps[s.key] !== "running",
    );
    if (next) {
      await executeStep(next.key);
    }
  }

  /** 重试失败步骤 */
  async function retryStep(key: WorkshopStepKey) {
    await executeStep(key);
  }

  /** 判断是否所有步骤完成 */
  const allDone = WORKSHOP_STEPS.every((s) => store.steps[s.key] === "done");
  /** 判断是否有步骤失败 */
  const hasError = WORKSHOP_STEPS.some((s) => store.steps[s.key] === "error");
  /** 是否有未完成步骤（用于显示「下一步」按钮） */
  const hasNext = WORKSHOP_STEPS.some(
    (s) => store.steps[s.key] !== "done" && store.steps[s.key] !== "running",
  );

  return (
    <section className="container-app py-10">
      <div className="module__head">
        <span className="eyebrow">
          <span className="num">04</span>
          分步 Agent 工坊
        </span>
        <h2 className="section-title">把创作拆成八道农事工序</h2>
        <p className="section-desc">
          勾选自动执行到哪一步，系统按顺序自动跑完；后续出图、配音、合成可手动逐步触发。
        </p>
      </div>

      <div className="mt-8 space-y-5">
        {/* 顶部控制栏：进度条 + 全局操作 */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <WorkshopProgressBar
                steps={store.steps}
                isAutoRunning={store.isAutoRunning}
                currentStep={store.currentStep}
              />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {/* 开始执行 / 继续自动执行 */}
              {!allDone && !hasError && (
                <Button
                  onClick={() => void startAutoRun()}
                  disabled={store.isStepRunning}
                  size="sm"
                >
                  {store.isStepRunning ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> 执行中
                    </>
                  ) : (
                    <>
                      <Play size={14} /> 开始执行
                    </>
                  )}
                </Button>
              )}

              {/* 下一步（有未完成步骤时显示） */}
              {hasNext && !store.isStepRunning && (
                <Button
                  onClick={() => void runNextStep()}
                  variant="outline"
                  size="sm"
                >
                  <ChevronRight size={14} /> 下一步
                </Button>
              )}

              {/* 全部完成提示 */}
              {allDone && (
                <span className="text-sm font-medium text-success">
                  全部完成
                </span>
              )}

              {/* 重置 */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm("确定重置所有步骤？")) store.reset();
                }}
                disabled={store.isStepRunning}
              >
                <RotateCcw size={14} /> 重置
              </Button>
            </div>
          </div>
        </div>

        {/* 步骤卡片网格 */}
        <WorkshopStepList
          steps={store.steps}
          autoRunToStep={store.autoRunToStep}
          currentStep={store.currentStep}
          onToggleAutoRun={(step) => store.setAutoRunToStep(step)}
          onStepClick={(key) => store.setCurrentStep(key)}
          onRetry={retryStep}
          onRun={executeStep}
          onPolish={handlePolish}
          isPolishing={textPolish.isPending}
          disabled={store.isStepRunning}
        />
      </div>
    </section>
  );
}
