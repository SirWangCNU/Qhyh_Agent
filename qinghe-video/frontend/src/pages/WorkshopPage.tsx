import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRunAgentStep } from "@/hooks/use-agents";
import { useTextPolish } from "@/hooks/use-text-polish";
import { useTopicGeneration } from "@/hooks/use-topic-generation";
import { useGenerateImage, useGenerateTTS, useComposeVideo } from "@/hooks/use-media";
import {
  WORKSHOP_STEPS,
  DEFAULT_AUTO_RUN_TO,
  type WorkshopStepKey,
  type WorkshopStepConfig,
  type NodeKey,
} from "@/lib/constants";
import { useWorkshopStore } from "@/stores/workshop-store";
import { WorkshopStepList } from "@/components/workshop/WorkshopStepList";
import type { CopywriterOutput } from "@/types/api";

/**
 * 分步 Agent 工坊（#/workshop）— Auto Video Agent 模式。
 *
 * Step1 极简输入嵌入 Step 1 卡片：产品名 + 一句话创意 → AI 润写 → 完整字段。
 * 9 步流水线以卡片网格平铺：策划→文案→一致性生图→脚本→视觉→投放→出图→配音→合成
 * 支持复选框自动批量执行 + 手动单步「运行此步」续跑。
 */
export function WorkshopPage() {
  const store = useWorkshopStore();

  // API hooks
  const runAgentStep = useRunAgentStep();
  const textPolish = useTextPolish();
  const topicGeneration = useTopicGeneration();
  const generateImage = useGenerateImage();
  const generateTTS = useGenerateTTS();
  const composeVideo = useComposeVideo();

  /** 校验表单必填字段 */
  function validateForm(): string | null {
    const f = store.form;
    if (!f.product_name.trim()) return "请填写产品名称";
    if (!store.oneLiner.trim()) {
      store.setOneLiner("为该产品制作一个吸引人的农业短视频");
    }
    if (store.selectedTopicIndex === null) return "请先点击 AI 选题并选择一个爆款主题";
    if (!f.selling_points.trim()) return "选题后正在自动补全创作信息，请稍候...";
    return null;
  }

  /** 后台自动补全表单（选定主题后静默调用，不暴露按钮） */
  async function handlePolish(): Promise<void> {
    if (!store.form.product_name.trim()) {
      alert("请先填写产品名称");
      throw new Error("请先填写产品名称");
    }
    const oneLiner = store.oneLiner.trim() || "为该产品制作一个吸引人的农业短视频";
    if (!store.oneLiner.trim()) {
      store.setOneLiner(oneLiner);
    }
    const resp = await textPolish.mutateAsync({
      product_name: store.form.product_name,
      one_liner: oneLiner,
    });
    store.setForm(resp.input);
  }

  /** 触发 AI 选题：生成多个爆款候选主题 */
  async function handleGenerateTopics(): Promise<void> {
    if (!store.form.product_name.trim()) {
      alert("请先填写产品名称");
      return;
    }
    const oneLiner = store.oneLiner.trim() || "为该产品制作一个吸引人的农业短视频";
    if (!store.oneLiner.trim()) {
      store.setOneLiner(oneLiner);
    }
    try {
      const resp = await topicGeneration.mutateAsync({
        product_name: store.form.product_name,
        one_liner: oneLiner,
        target_platform: store.form.target_platform,
      });
      store.setTopics(resp.topics);
      store.setSelectedTopicIndex(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`选题失败：${msg}`);
    }
  }

  /** 选定主题：回填 oneLiner 并自动触发润写补全表单 */
  async function handleSelectTopic(index: number): Promise<void> {
    const topic = store.topics[index];
    if (!topic) return;
    store.setSelectedTopicIndex(index);
    store.setOneLiner(topic.theme);
    // 选定后自动润写，形成 选题→润写→表单→planner 顺畅流
    try {
      await handlePolish();
    } catch {
      /* handlePolish 内部已 alert */
    }
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
          if (key === "consistency_images") {
            await execConsistencyImages();
          } else {
            await execImageGen();
          }
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
      selected_topic: store.selectedTopic,
    });
    if (resp.status === "error") {
      throw new Error(resp.error ?? `${key} 执行失败`);
    }
    store.setStepOutput(key, resp.output);
    store.setWorkshopState(resp.state);

    // 文案步骤完成后，把生成的一致性规划同步写入一致性参考，供 visual_designer 注入
    if (key === "copywriter") {
      const plan = resp.state?.copywriter_output?.consistency_plan;
      if (plan?.character_subject) {
        store.setConsistencyReferences("character", plan.character_subject);
      }
      if (plan?.object_subject) {
        store.setConsistencyReferences("object", plan.object_subject);
      }
      if (plan?.scene_subject) {
        store.setConsistencyReferences("scene", plan.scene_subject);
      }
    }
  }

  /** 出图：逐镜生成图片 */
  async function execImageGen() {
    const shotPrompts = store.workshopState.visual_output?.shot_prompts ?? [];
    if (shotPrompts.length === 0) {
      throw new Error("视觉 Agent 未生成 shot_prompts");
    }
    const prompts = shotPrompts.slice(0, 4);

    // B1 联动：开启且第 3 步已生成人物参考图时，透传给后端走图生图
    const characterRefUrl = store.imageGenUseCharacterRef
      ? store.mediaResults.characterImage?.url ?? null
      : null;

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
          ...(characterRefUrl ? { reference_image_path: characterRefUrl } : {}),
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

  /**
   * 一致性生图：实际生成在子卡片中独立完成（主体描述/参考图由用户在面板输入）。
   * 此函数仅校验是否至少一类已生成；若全部为空，提示用户去面板操作。
   */
  async function execConsistencyImages() {
    const m = store.mediaResults;
    const anyDone =
      m.characterImage?.status === "done" ||
      m.objectImage?.status === "done" ||
      m.sceneImage?.status === "done";
    if (!anyDone) {
      throw new Error("请在下方卡片中填写主体描述（必填）并点击「生成」；可选择性上传参考图走图生图。");
    }
    store.setStepOutput("consistency_images", {
      character: m.characterImage?.url ?? null,
      object: m.objectImage?.url ?? null,
      scene: m.sceneImage?.url ?? null,
    });
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

  /** 自动执行：从第一个未完成步骤执行到第 5 步（视觉/投放之后，出图/配音/合成手动触发） */
  async function startAutoRun() {
    const formError = validateForm();
    if (formError) {
      alert(formError);
      return;
    }
    store.setAutoRunning(true);
    try {
      for (const cfg of WORKSHOP_STEPS) {
        if (cfg.num > DEFAULT_AUTO_RUN_TO) break;
        if (store.steps[cfg.key] === "done") continue;
        // 一致性生图需要用户主动输入主体描述/上传参考图，自动流跳过
        if (cfg.key === "consistency_images") continue;
        const ok = await executeStep(cfg.key);
        if (!ok) break; // 失败则暂停
      }
    } finally {
      store.setAutoRunning(false);
    }
  }

  /** 重试失败步骤 */
  async function retryStep(key: WorkshopStepKey) {
    await executeStep(key);
  }

  return (
    <section className="container-app py-10">
      <div className="module__head">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="eyebrow">
              <span className="num">04</span>
              分步 Agent 工坊
            </span>
            <h2 className="section-title">把创作拆成九道农事工序</h2>
          </div>
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
        <p className="section-desc">
          选题确认后点击开始执行，系统自动跑完前 5 步；后续出图、配音、合成可手动逐步触发。
        </p>
      </div>

      <div className="mt-8 space-y-5">
        {/* 步骤卡片网格 */}
        <WorkshopStepList
          steps={store.steps}
          currentStep={store.currentStep}
          onStepClick={(key) => store.setCurrentStep(key)}
          onRetry={retryStep}
          onRun={executeStep}
          onStartAutoRun={() => void startAutoRun()}
          isApplying={textPolish.isPending}
          onGenerateTopics={handleGenerateTopics}
          onSelectTopic={handleSelectTopic}
          isGeneratingTopics={topicGeneration.isPending}
          disabled={store.isStepRunning}
        />
      </div>
    </section>
  );
}
