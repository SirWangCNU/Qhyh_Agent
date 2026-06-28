import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { WheatMark } from "@/components/shared/WheatMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin, useRegister, formatAuthError, loginSchema, registerSchema, type LoginInput, type RegisterInput } from "@/hooks/use-auth";

type Mode = "login" | "register";

/**
 * 登录/注册遮罩。
 * - 未登录时由 AppLayout 渲染（AnimatePresence 控制出场动画）
 * - 使用 React Hook Form + Zod 校验
 * - 默认管理员账号：admin / admin123
 */
export function AuthOverlay() {
  const [mode, setMode] = useState<Mode>("login");
  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      role="dialog"
      aria-modal="true"
      aria-label={mode === "login" ? "登录" : "注册"}
    >
      <motion.div
        className="mx-4 w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-lg"
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -16, scale: 0.96 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <WheatMark size={40} />
          <h2 className="mt-3 font-display text-xl font-semibold text-ink">
            青禾映画 · 管理登录
          </h2>
        </div>

        {mode === "login" ? (
          <LoginForm onSwitch={() => setMode("register")} />
        ) : (
          <RegisterForm onSwitch={() => setMode("login")} />
        )}

        <p className="mt-6 text-center text-xs text-ink-faint">
          默认管理员账号：<code className="rounded bg-secondary px-1 py-0.5 font-mono">admin</code> /{" "}
          <code className="rounded bg-secondary px-1 py-0.5 font-mono">admin123</code>
        </p>
      </motion.div>
    </motion.div>
  );
}

function LoginForm({ onSwitch }: { onSwitch: () => void }) {
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
      className="space-y-4"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="login-username">用户名</Label>
        <Input
          id="login-username"
          autoComplete="username"
          placeholder="请输入用户名"
          aria-invalid={!!errors.username}
          aria-describedby={errors.username ? "login-username-error" : undefined}
          {...register("username")}
        />
        {errors.username && (
          <p id="login-username-error" className="text-xs text-destructive">
            {errors.username.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="login-password">密码</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          placeholder="请输入密码"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? "login-password-error" : undefined}
          {...register("password")}
        />
        {errors.password && (
          <p id="login-password-error" className="text-xs text-destructive">
            {errors.password.message}
          </p>
        )}
      </div>

      {login.isError && (
        <p role="alert" className="text-xs text-destructive">
          {formatAuthError(login.error)}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={login.isPending}>
        {login.isPending ? "登录中…" : "登录"}
      </Button>

      <p className="text-center text-sm text-ink-soft">
        还没有账号？
        <button
          type="button"
          onClick={onSwitch}
          className="ml-1 text-primary underline-offset-4 hover:underline"
        >
          立即注册
        </button>
      </p>
    </form>
  );
}

function RegisterForm({ onSwitch }: { onSwitch: () => void }) {
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
      className="space-y-4"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="register-username">用户名</Label>
        <Input
          id="register-username"
          autoComplete="username"
          placeholder="至少 3 个字符"
          aria-invalid={!!errors.username}
          aria-describedby={errors.username ? "register-username-error" : undefined}
          {...register("username")}
        />
        {errors.username && (
          <p id="register-username-error" className="text-xs text-destructive">
            {errors.username.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="register-password">密码</Label>
        <Input
          id="register-password"
          type="password"
          autoComplete="new-password"
          placeholder="至少 6 个字符"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? "register-password-error" : undefined}
          {...register("password")}
        />
        {errors.password && (
          <p id="register-password-error" className="text-xs text-destructive">
            {errors.password.message}
          </p>
        )}
      </div>

      {registerMutation.isError && (
        <p role="alert" className="text-xs text-destructive">
          {formatAuthError(registerMutation.error)}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
        {registerMutation.isPending ? "注册中…" : "注册"}
      </Button>

      <p className="text-center text-sm text-ink-soft">
        已有账号？
        <button
          type="button"
          onClick={onSwitch}
          className="ml-1 text-primary underline-offset-4 hover:underline"
        >
          返回登录
        </button>
      </p>
    </form>
  );
}
