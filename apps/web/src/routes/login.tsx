// 版式参考 Watermelon UI（https://ui.watermelon.sh）auth-02/auth-04 区块，MIT License。
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import type { SubmitEvent } from "react";
import { toast } from "sonner";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@handoverkit/ui/components/alert";
import { Button } from "@handoverkit/ui/components/button";
import { Input } from "@handoverkit/ui/components/input";

import { AppBrand } from "#src/components/app/app-brand.tsx";
import { FormField } from "#src/components/app/form-field.tsx";
import { BrandPanel } from "#src/components/auth/brand-panel.tsx";
import { fetchCaptcha, loginWithPassword } from "#src/lib/auth-api.ts";
import type { LoginInput } from "#src/lib/auth-api.ts";

const sameOriginPath = /^\/(?!\/)/u;

const isSameOriginRedirect = (value: unknown): value is string =>
  typeof value === "string" && sameOriginPath.test(value);

const validateSearch = (search: {
  redirect?: unknown;
}): { redirect?: string } =>
  isSameOriginRedirect(search.redirect) ? { redirect: search.redirect } : {};

interface LoginFieldErrors {
  username?: string;
  password?: string;
  captcha?: string;
}

const CAPTCHA_IMAGE_CLASS = "h-11 w-33";

const CAPTCHA_WRAPPER_CLASS =
  "bg-primary/5 focus-visible:ring-ring flex h-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border px-1 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60";

const LoginPage = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const captcha = useQuery({
    gcTime: 0,
    queryFn: fetchCaptcha,
    queryKey: ["login-captcha"],
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const refreshCaptcha = async () => {
    setCaptchaAnswer("");
    setFieldErrors((current) => ({ ...current, captcha: undefined }));
    await captcha.refetch();
  };

  const login = useMutation({
    mutationFn: loginWithPassword,
    onError: (error) => {
      setFormError(error.message);
      // 验证码是一次性的：登录失败后必须换一张。
      void refreshCaptcha();
    },
    onSuccess: async () => {
      toast.success("登录成功");
      queryClient.clear();
      await router.invalidate();
      await router.navigate({ href: search.redirect ?? "/" });
    },
  });

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors: LoginFieldErrors = {};

    if (username.trim().length < 3) {
      nextErrors.username = "登录名至少 3 个字符";
    }

    if (password.length < 8) {
      nextErrors.password = "密码至少 8 位";
    }

    if (captchaAnswer.trim().length === 0) {
      nextErrors.captcha = "请输入图形验证码";
    }

    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const challenge = captcha.data;

    if (challenge === undefined) {
      setFormError("验证码尚未加载完成，请点击验证码刷新");

      return;
    }

    setFormError(null);

    const input: LoginInput = {
      captchaAnswer: captchaAnswer.trim(),
      captchaId: challenge.id,
      password,
      username: username.trim().toLowerCase(),
    };

    login.mutate(input);
  };

  const pending = login.isPending;

  const renderCaptcha = () => {
    if (captcha.isPending || captcha.isFetching) {
      return (
        <Loader2Icon className="text-muted-foreground size-4 animate-spin" />
      );
    }

    if (captcha.data === undefined) {
      return <RefreshCwIcon className="text-muted-foreground size-4" />;
    }

    return (
      <img
        alt=""
        aria-hidden="true"
        className={CAPTCHA_IMAGE_CLASS}
        height={44}
        src={`data:image/svg+xml;utf8,${encodeURIComponent(captcha.data.svg)}`}
        width={132}
      />
    );
  };

  return (
    <div className="lg:grid lg:min-h-svh lg:grid-cols-[1.05fr_minmax(0,1fr)]">
      <BrandPanel />
      <div className="flex min-h-svh flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden">
            <AppBrand />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">登录</h1>
            <p className="text-muted-foreground text-sm">
              使用管理员创建的账号登录系统
            </p>
          </div>

          <form className="grid gap-4" noValidate onSubmit={handleSubmit}>
            {formError === null ? null : (
              <Alert variant="destructive">
                <AlertTitle>登录失败</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <FormField
              error={fieldErrors.username}
              id="login-username"
              label="登录名"
              required
            >
              {(field) => (
                <Input
                  {...field}
                  autoComplete="username"
                  disabled={pending}
                  maxLength={30}
                  onChange={(event) => {
                    setUsername(event.target.value);
                  }}
                  placeholder="例如 admin"
                  value={username}
                />
              )}
            </FormField>

            <FormField
              error={fieldErrors.password}
              id="login-password"
              label="密码"
              required
            >
              {(field) => (
                <Input
                  {...field}
                  autoComplete="current-password"
                  disabled={pending}
                  maxLength={128}
                  onChange={(event) => {
                    setPassword(event.target.value);
                  }}
                  type="password"
                  value={password}
                />
              )}
            </FormField>

            <FormField
              error={fieldErrors.captcha}
              id="login-captcha"
              label="图形验证码"
              required
            >
              {(field) => (
                <div className="flex items-center gap-2">
                  <Input
                    {...field}
                    autoComplete="off"
                    className="flex-1"
                    disabled={pending}
                    maxLength={10}
                    onChange={(event) => {
                      setCaptchaAnswer(event.target.value);
                    }}
                    placeholder="输入右侧字符"
                    value={captchaAnswer}
                  />
                  <button
                    aria-label="刷新图形验证码"
                    className={CAPTCHA_WRAPPER_CLASS}
                    disabled={pending || captcha.isFetching}
                    onClick={() => {
                      void refreshCaptcha();
                    }}
                    type="button"
                  >
                    {renderCaptcha()}
                  </button>
                </div>
              )}
            </FormField>

            <Button
              className="w-full"
              disabled={pending || captcha.data === undefined}
              size="lg"
              type="submit"
            >
              {pending ? "登录中…" : "登录"}
            </Button>
          </form>

          <p className="text-muted-foreground text-center text-xs">
            账号由管理员创建，系统不开放自助注册。
          </p>

          {import.meta.env.DEV ? (
            <p className="text-muted-foreground border-t pt-4 text-center text-xs">
              演示账号：admin / Admin@123456（仅开发环境）
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export const Route = createFileRoute("/login")({
  beforeLoad: ({ context, search }) => {
    if (context.session) {
      throw redirect({ href: search.redirect ?? "/" });
    }
  },
  component: LoginPage,
  validateSearch,
});
