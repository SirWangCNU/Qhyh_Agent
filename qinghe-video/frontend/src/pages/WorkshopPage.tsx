import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { RotateCcw, LayoutGrid, Loader2, Plus, Check, CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRunAgentStep } from "@/hooks/use-agents";
import { useTextPolish } from "@/hooks/use-text-polish";
import { useTopicGeneration } from "@/hooks/use-topic-generation";
import {
  useCreateWorkshopSession,
  useWorkshopSession,
} from "@/hooks/use-workshop-sessions";
import { useWorkshopAutosave } from "@/hooks/use-workshop-autosave";
import {
  WORKSHOP_STEPS,
  DEFAULT_AUTO_RUN_TO,
  ROUTES,
  type WorkshopStepKey,
  type WorkshopStepConfig,
  type NodeKey,
} from "@/lib/constants";
import { useWorkshopStore } from "@/stores/workshop-store";
import { useExportStoryboardToCanvas } from "@/components/canvas/hooks/useExportStoryboardToCanvas";
import { WorkshopStepList } from "@/components/workshop/WorkshopStepList";

/**
 * 分步 Agent 工坊（#/workshop）— Auto Video Agent 模式。
 *
 * Step1 极简输入嵌入 Step 1 卡片：产品名 + 一句话创意 → AI 润写 → 完整字段。
 * 4 步流水线以卡片网格平铺：策划→文案→一致性生图→脚本
 * 支持复选框自动批量执行 + 手动单步「运行此步」续跑。
 */
export function WorkshopPage() {
  const store = useWorkshopStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSessionId = searchParams.get("sessionId");

  // API hooks
  const runAgentStep = useRunAgentStep();
  const textPolish = useTextPolish();
  const topicGeneration = useTopicGeneration();
  const storyboardExport = useExportStoryboardToCanvas();
  const sessionQuery = useWorkshopSession(
    urlSessionId && urlSessionId !== store.sessionId ? urlSessionId : null,
  );
  const createSession = useCreateWorkshopSession();
  const navigate = useNavigate();

  // 自动保存：监听 dirty，debounce 2s 后 PUT 到后端
  useWorkshopAutosave();

  // 从后端载入会话（URL ?sessionId 变化且与当前 store 不同时）
  useEffect(() => {
    if (!urlSessionId) return;
    if (urlSessionId === store.sessionId) return;
    if (sessionQuery.data) {
      useWorkshopStore.getState().loadSession({
        id: sessionQuery.data.id,
        name: sessionQuery.data.name,
        state: sessionQuery.data.state,
      });
    }
  }, [urlSessionId, sessionQuery.data, store.sessionId]);

  /** 新建工坊会话：把当前状态快照存到后端，关联 sessionId */
  async function handleNewSession(): Promise<void> {
    try {
      const name = `工坊 ${store.form.product_name || ""} ${new Date().toLocaleString("zh-CN", { hour12: false })}`.trim();
      const snapshot = store.buildSnapshot();
      const res = await createSession.mutateAsync({ name, state: snapshot });
      useWorkshopStore.getState().loadSession({
        id: res.id,
        name: res.name,
        state: res.state,
      });
      setSearchParams({ sessionId: res.id }, { replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`新建工坊失败：${msg}`);
    }
  }

  /** 校验表单必填字段 */
  function validateForm(): string | null {
    const state = useWorkshopStore.getState();
    const f = state.form;
    if (!f.product_name.trim()) return "请填写产品名称";
    if (!state.oneLiner.trim()) {
      state.setOneLiner("为该产品制作一个吸引人的农业短视频");
    }
    if (state.selectedTopicIndex === null) return "请先点击 AI 选题并选择一个爆款主题";
    if (!f.selling_points.trim()) return "选题后正在自动补全创作信息，请稍候...";
    return null;
  }

  /** 后台自动补全表单（选定主题后静默调用，不暴露按钮） */
  async function handlePolish(): Promise<void> {
    const state = useWorkshopStore.getState();
    if (!state.form.product_name.trim()) {
      alert("请先填写产品名称");
      throw new Error("请先填写产品名称");
    }
    const oneLiner = state.oneLiner.trim() || "为该产品制作一个吸引人的农业短视频";
    if (!state.oneLiner.trim()) {
      state.setOneLiner(oneLiner);
    }
    const resp = await textPolish.mutateAsync({
      product_name: state.form.product_name,
      one_liner: oneLiner,
    });
    state.setForm(resp.input);
  }

  /** 触发 AI 选题：生成多个爆款候选主题 */
  async function handleGenerateTopics(): Promise<void> {
    const state = useWorkshopStore.getState();
    if (!state.form.product_name.trim()) {
      alert("请先填写产品名称");
      return;
    }
    const oneLiner = state.oneLiner.trim() || "为该产品制作一个吸引人的农业短视频";
    if (!state.oneLiner.trim()) {
      state.setOneLiner(oneLiner);
    }
    try {
      const resp = await topicGeneration.mutateAsync({
        product_name: state.form.product_name,
        one_liner: oneLiner,
        target_platform: state.form.target_platform,
      });
      state.setTopics(resp.topics);
      state.setSelectedTopicIndex(null);
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
    const steps = useWorkshopStore.getState().steps;
    for (const dep of cfg.deps) {
      if (steps[dep] !== "done") {
        const depCfg = WORKSHOP_STEPS.find((s) => s.key === dep);
        return `请先完成「${depCfg?.title ?? dep}」步骤`;
      }
    }
    return null;
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
          }
          break;
        default:
          throw new Error(`不支持的步骤类型: ${cfg.type}`);
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
    const state = useWorkshopStore.getState();
    const resp = await runAgentStep.mutateAsync({
      step: key as NodeKey,
      input: state.form,
      state: state.workshopState,
      selected_topic: state.selectedTopic,
    });
    if (resp.status === "error") {
      throw new Error(resp.error ?? `${key} 执行失败`);
    }
    state.setStepOutput(key, resp.output);
    state.setWorkshopState(resp.state);

    // 文案步骤完成后，把生成的一致性规划同步写入一致性参考，供画布/后续视觉生成使用
    if (key === "copywriter") {
      const plan = resp.state?.copywriter_output?.consistency_plan;
      if (plan?.character_subject) {
        state.setConsistencyReferences("character", plan.character_subject);
      }
      if (plan?.object_subject) {
        state.setConsistencyReferences("object", plan.object_subject);
      }
      if (plan?.scene_subject) {
        state.setConsistencyReferences("scene", plan.scene_subject);
      }
    }
  }

  /**
   * 一致性生图：实际生成在子卡片中独立完成（主体描述/参考图由用户在面板输入）。
   * 此函数仅校验是否至少一类已生成；若全部为空，提示用户去面板操作。
   */
  async function execConsistencyImages() {
    const state = useWorkshopStore.getState();
    const m = state.mediaResults;
    const anyDone =
      m.characterImage?.status === "done" ||
      m.objectImage?.status === "done" ||
      m.sceneImage?.status === "done";
    if (!anyDone) {
      throw new Error("请在下方卡片中填写主体描述（必填）并点击「生成」；可选择性上传参考图走图生图。");
    }
    state.setStepOutput("consistency_images", {
      character: m.characterImage?.url ?? null,
      object: m.objectImage?.url ?? null,
      scene: m.sceneImage?.url ?? null,
    });
  }

  /** 自动执行：从第一个未完成步骤执行到第 4 步（脚本完成，跳过一致性生图） */
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
        if (useWorkshopStore.getState().steps[cfg.key] === "done") continue;
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

  // 故事板导出按钮显示条件：脚本步骤已完成且 payload 可构造
  const canExportStoryboard =
    store.steps.scriptwriter === "done" && storyboardExport.canExport;

  return (
    <section className="container-app py-10">
      <div className="module__head">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="eyebrow">
              <span className="num">04</span>
              分步 Agent 工坊
            </span>
            <h2 className="section-title">把创作拆成四道农事工序</h2>
            {store.sessionName && (
              <p className="mt-1 text-xs text-muted-foreground">
                当前会话：{store.sessionName}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* 保存状态指示器 */}
            {store.sessionId && (
              <SaveStatusIndicator status={store.saveStatus} dirty={store.dirty} />
            )}
            {/* 新建工坊：把当前状态存到后端，生成可切换的历史记录 */}
            <Button
              variant="default"
              size="sm"
              onClick={() => void handleNewSession()}
              disabled={createSession.isPending}
              title="新建工坊会话并保存到云端"
            >
              {createSession.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}{" "}
              新建工坊
            </Button>
            {/* 常驻入口：随时进入无限画布自由创作 / 故事板模式 */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(ROUTES.canvas)}
              title="进入无限画布：拖拽参考图、撰写提示词、连线生成；故事板模式下可批量出图与一键合成视频"
            >
              <LayoutGrid size={14} /> 无限画布
            </Button>
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
        <p className="section-desc">
          选题确认后点击开始执行，系统自动跑完前 4 步（跳过一致性生图）。
        </p>
      </div>

      {/* 故事板导出条：脚本完成且故事板数据完整后展示，一键把分镜导入无限画布二次创作 */}
      {canExportStoryboard && (
        <div className="mt-6 flex flex-col gap-2 rounded-lg border border-orange-200 bg-orange-50/60 p-3 dark:border-orange-900/40 dark:bg-orange-950/20 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <LayoutGrid className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
            <div className="text-xs">
              <div className="font-medium text-foreground">
                脚本已就绪 — 可进入无限画布故事板模式
              </div>
              <div className="mt-0.5 text-muted-foreground">
                将分镜阵列、人物/物品/场景参考图与旁白一键导入画布，支持拖拽替换、批量出图、一键合成视频。
              </div>
            </div>
          </div>
          <Button
            size="sm"
            className="shrink-0"
            disabled={storyboardExport.exporting || store.isStepRunning}
            onClick={() => void storyboardExport.exportToCanvas()}
          >
            {storyboardExport.exporting ? (
              <>
                <Loader2 size={14} className="animate-spin" /> 导出中
              </>
            ) : (
              <>
                <LayoutGrid size={14} /> 在画布中编辑故事板
              </>
            )}
          </Button>
        </div>
      )}
      {storyboardExport.error && (
        <p className="mt-2 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {storyboardExport.error}
        </p>
      )}

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

/** 保存状态指示器（小字 + 图标，对齐 canvas 的 autosave 体验）。 */
function SaveStatusIndicator({
  status,
  dirty,
}: {
  status: "idle" | "saving" | "saved" | "error";
  dirty: boolean;
}) {
  if (status === "saving") {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 size={12} className="animate-spin" /> 保存中...
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <CloudOff size={12} /> 保存失败
      </span>
    );
  }
  if (status === "saved" && !dirty) {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
        <Check size={12} /> 已保存
      </span>
    );
  }
  // idle 或 dirty（待保存）
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      {dirty ? "未保存" : ""}
    </span>
  );
}
