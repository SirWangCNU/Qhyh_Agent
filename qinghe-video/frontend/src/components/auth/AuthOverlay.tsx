import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import { User, Lock, ArrowRight, Loader2, Wheat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  useLogin,
  useRegister,
  formatAuthError,
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

/**
 * 登录页背景图：金色麦田晨光，电影感农业摄影。
 * 本地离线或图片不可用时，多层渐变会保证右侧表单区仍可正常显示。
 */
const HERO_IMAGE =
  "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1920&q=85&auto=format&fit=crop";

/** 页面级入场动画曲线。 */
const easeOutExpo: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** 统一的 staggered children 动画。 */
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: easeOutExpo } },
};

/**
 * 登录/注册遮罩。
 * - 未登录时由 AppLayout 渲染（AnimatePresence 控制出场动画）
 * - 使用 React Hook Form + Zod 校验
 * - 默认管理员账号：admin / admin123
 *
 * 视觉风格：深色分屏电影感（Cinematic Agrarian Dark）。
 * 左侧为大幅沉浸式农业影像，右侧为深色玻璃质感表单。
 */
export function AuthOverlay() {
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex overflow-hidden bg-[#18120a] text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: easeOutExpo }}
      role="dialog"
      aria-modal="true"
      aria-label="登录"
    >
      {/* ============================================================
          左侧：沉浸式视觉
          ============================================================ */}
      <motion.div
        className="relative hidden lg:block lg:w-[55%] xl:w-[58%]"
        initial={{ opacity: 0, scale: 1.08 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.2, ease: easeOutExpo }}
      >
        <motion.div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${HERO_IMAGE})` }}
          aria-hidden="true"
          initial={{ scale: 1.12 }}
          animate={{ scale: 1 }}
          transition={{ duration: 8, ease: "easeOut" }}
        />

        {/* 多层渐变遮罩，营造电影海报感 */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#18120a]/35 via-[#18120a]/10 to-[#18120a]/55" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#18120a]/55 via-transparent to-[#18120a]/15" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#18120a_135%)] opacity-20" />

        {/* 胶片颗粒纹理 */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.09] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
          aria-hidden="true"
        />

        {/* 品牌浮层 */}
        <motion.div
          className="absolute bottom-10 left-10 z-10 max-w-sm"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.9, ease: easeOutExpo }}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#f2d48b]/55 bg-white/[0.14] backdrop-blur-sm">
              <Wheat className="h-5 w-5 text-[#f2d48b]" />
            </div>
            <span className="font-instrument text-2xl tracking-wide text-white/95">
              青禾映画
            </span>
          </div>
          <p className="mt-3 font-geist text-sm font-light leading-relaxed text-white/75">
            农业短视频智能创作平台
            <br />
            输入农产品信息，一键生成完整创作方案
          </p>
        </motion.div>
      </motion.div>

      {/* ============================================================
          右侧：深色表单
          ============================================================ */}
      <div className="relative flex w-full flex-col justify-center lg:w-[45%] xl:w-[42%]">
        {/* 背景底色 +  subtle 噪点纹理 */}
        <div className="absolute inset-0 bg-[#18120a]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(201,169,97,0.18),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_45%)]" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n2'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n2)'/%3E%3C/svg%3E")`,
          }}
          aria-hidden="true"
        />
        {/* 与左侧的分隔辉光 */}
        <div className="absolute left-0 top-0 hidden h-full w-px bg-gradient-to-b from-transparent via-white/24 to-transparent lg:block" />

        <div className="relative z-10 mx-auto w-full max-w-md px-6 sm:px-10 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: easeOutExpo }}
          >
            <div className="mb-8 text-center lg:text-left">
              <h1 className="font-instrument text-4xl tracking-wide text-white sm:text-5xl">
                欢迎登录
              </h1>
              <p className="mt-3 font-geist text-sm font-light text-white/70">
                开启你的农业短视频创作之旅
              </p>
            </div>

            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as "login" | "register")}
            >
              <TabsList className="mb-6 grid w-full grid-cols-2 rounded-xl border border-white/20 bg-white/[0.12] p-1 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
                <TabsTrigger
                  value="login"
                  className="rounded-lg text-sm font-geist font-normal text-white/70 transition-all duration-300 data-[state=active]:bg-white/[0.18] data-[state=active]:font-medium data-[state=active]:text-[#f2d48b] data-[state=active]:shadow-[0_0_24px_rgba(201,169,97,0.18)]"
                >
                  账号登录
                </TabsTrigger>
                <TabsTrigger
                  value="register"
                  className="rounded-lg text-sm font-geist font-normal text-white/70 transition-all duration-300 data-[state=active]:bg-white/[0.18] data-[state=active]:font-medium data-[state=active]:text-[#f2d48b] data-[state=active]:shadow-[0_0_24px_rgba(201,169,97,0.18)]"
                >
                  注册账号
                </TabsTrigger>
              </TabsList>

              <AnimatePresence mode="wait">
                <TabsContent value="login" className="mt-0">
                  <motion.div
                    key="login"
                    initial="hidden"
                    animate="show"
                    exit="hidden"
                    variants={containerVariants}
                  >
                    <LoginForm />
                  </motion.div>
                </TabsContent>

                <TabsContent value="register" className="mt-0">
                  <motion.div
                    key="register"
                    initial="hidden"
                    animate="show"
                    exit="hidden"
                    variants={containerVariants}
                  >
                    <RegisterForm />
                  </motion.div>
                </TabsContent>
              </AnimatePresence>
            </Tabs>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

function LoginForm() {
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  return (
    <form
      onSubmit={handleSubmit((v) => login.mutate(v))}
      className="space-y-5"
      noValidate
    >
      <motion.div variants={itemVariants} className="space-y-1.5">
        <Label htmlFor="login-username" className="font-geist text-xs font-medium text-white/78">
          用户名
        </Label>
        <div className="relative">
          <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
          <Input
            id="login-username"
            autoComplete="username"
            placeholder="请输入用户名"
            aria-invalid={!!errors.username}
            aria-describedby={errors.username ? "login-username-error" : undefined}
            className={cn(
              "h-12 border-white/20 bg-white/[0.12] pl-11 font-geist text-white placeholder:text-white/45 shadow-[0_10px_30px_rgba(0,0,0,0.16)]",
              "transition-all duration-300",
              "focus:border-[#f2d48b]/55 focus:bg-white/[0.16] focus:ring-1 focus:ring-[#f2d48b]/25 focus-visible:ring-[#f2d48b]/25",
              errors.username && "border-red-500/50 focus:border-red-500/50",
            )}
            {...register("username")}
          />
        </div>
        {errors.username && (
          <p id="login-username-error" className="text-xs text-red-400/90">
            {errors.username.message}
          </p>
        )}
      </motion.div>

      <motion.div variants={itemVariants} className="space-y-1.5">
        <Label htmlFor="login-password" className="font-geist text-xs font-medium text-white/78">
          密码
        </Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            placeholder="请输入密码"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "login-password-error" : undefined}
            className={cn(
              "h-12 border-white/20 bg-white/[0.12] pl-11 font-geist text-white placeholder:text-white/45 shadow-[0_10px_30px_rgba(0,0,0,0.16)]",
              "transition-all duration-300",
              "focus:border-[#f2d48b]/55 focus:bg-white/[0.16] focus:ring-1 focus:ring-[#f2d48b]/25 focus-visible:ring-[#f2d48b]/25",
              errors.password && "border-red-500/50 focus:border-red-500/50",
            )}
            {...register("password")}
          />
        </div>
        {errors.password && (
          <p id="login-password-error" className="text-xs text-red-400/90">
            {errors.password.message}
          </p>
        )}
      </motion.div>

      {login.isError && (
        <motion.p
          variants={itemVariants}
          role="alert"
          className="text-xs text-red-400/90"
        >
          {formatAuthError(login.error)}
        </motion.p>
      )}

      <motion.div variants={itemVariants}>
        <Button
          type="submit"
          disabled={login.isPending}
          className={cn(
            "group relative h-12 w-full overflow-hidden rounded-xl border border-[#f2d48b]/45",
            "bg-gradient-to-r from-[#f2d48b] to-[#c9a961] font-geist font-medium text-[#18120a] shadow-[0_14px_38px_rgba(201,169,97,0.22)]",
            "transition-all duration-300",
            "hover:shadow-[0_0_36px_rgba(242,212,139,0.34)] hover:brightness-110",
            "active:scale-[0.98] disabled:opacity-60",
          )}
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            {login.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                登录中…
              </>
            ) : (
              <>
                立即创作
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
              </>
            )}
          </span>
          {/* shimmer */}
          <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
        </Button>
      </motion.div>

      <motion.p
        variants={itemVariants}
        className="text-center font-geist text-xs text-white/58"
      >
        默认管理员账号：{" "}
        <code className="rounded bg-white/12 px-1.5 py-0.5 font-mono text-[#f2d48b]">
          admin
        </code>{" "}
        /{" "}
        <code className="rounded bg-white/12 px-1.5 py-0.5 font-mono text-[#f2d48b]">
          admin123
        </code>
      </motion.p>
    </form>
  );
}

function RegisterForm() {
  const registerMutation = useRegister();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: "", password: "" },
  });

  return (
    <form
      onSubmit={handleSubmit((v) => registerMutation.mutate(v))}
      className="space-y-5"
      noValidate
    >
      <motion.div variants={itemVariants} className="space-y-1.5">
        <Label htmlFor="register-username" className="font-geist text-xs font-medium text-white/78">
          用户名
        </Label>
        <div className="relative">
          <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
          <Input
            id="register-username"
            autoComplete="username"
            placeholder="至少 3 个字符"
            aria-invalid={!!errors.username}
            aria-describedby={errors.username ? "register-username-error" : undefined}
            className={cn(
              "h-12 border-white/20 bg-white/[0.12] pl-11 font-geist text-white placeholder:text-white/45 shadow-[0_10px_30px_rgba(0,0,0,0.16)]",
              "transition-all duration-300",
              "focus:border-[#f2d48b]/55 focus:bg-white/[0.16] focus:ring-1 focus:ring-[#f2d48b]/25 focus-visible:ring-[#f2d48b]/25",
              errors.username && "border-red-500/50 focus:border-red-500/50",
            )}
            {...register("username")}
          />
        </div>
        {errors.username && (
          <p id="register-username-error" className="text-xs text-red-400/90">
            {errors.username.message}
          </p>
        )}
      </motion.div>

      <motion.div variants={itemVariants} className="space-y-1.5">
        <Label htmlFor="register-password" className="font-geist text-xs font-medium text-white/78">
          密码
        </Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
          <Input
            id="register-password"
            type="password"
            autoComplete="new-password"
            placeholder="至少 6 个字符"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "register-password-error" : undefined}
            className={cn(
              "h-12 border-white/20 bg-white/[0.12] pl-11 font-geist text-white placeholder:text-white/45 shadow-[0_10px_30px_rgba(0,0,0,0.16)]",
              "transition-all duration-300",
              "focus:border-[#f2d48b]/55 focus:bg-white/[0.16] focus:ring-1 focus:ring-[#f2d48b]/25 focus-visible:ring-[#f2d48b]/25",
              errors.password && "border-red-500/50 focus:border-red-500/50",
            )}
            {...register("password")}
          />
        </div>
        {errors.password && (
          <p id="register-password-error" className="text-xs text-red-400/90">
            {errors.password.message}
          </p>
        )}
      </motion.div>

      {registerMutation.isError && (
        <motion.p
          variants={itemVariants}
          role="alert"
          className="text-xs text-red-400/90"
        >
          {formatAuthError(registerMutation.error)}
        </motion.p>
      )}

      <motion.div variants={itemVariants}>
        <Button
          type="submit"
          disabled={registerMutation.isPending}
          className={cn(
            "group relative h-12 w-full overflow-hidden rounded-xl border border-[#f2d48b]/45",
            "bg-gradient-to-r from-[#f2d48b] to-[#c9a961] font-geist font-medium text-[#18120a] shadow-[0_14px_38px_rgba(201,169,97,0.22)]",
            "transition-all duration-300",
            "hover:shadow-[0_0_36px_rgba(242,212,139,0.34)] hover:brightness-110",
            "active:scale-[0.98] disabled:opacity-60",
          )}
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            {registerMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                注册中…
              </>
            ) : (
              <>
                立即注册
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
              </>
            )}
          </span>
          <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
        </Button>
      </motion.div>

      <motion.p
        variants={itemVariants}
        className="text-center font-geist text-xs text-white/58"
      >
        注册即表示同意{" "}
        <button type="button" className="text-[#f2d48b] hover:text-[#ffe5a3] hover:underline">
          用户协议
        </button>{" "}
        和{" "}
        <button type="button" className="text-[#f2d48b] hover:text-[#ffe5a3] hover:underline">
          隐私政策
        </button>
      </motion.p>
    </form>
  );
}
