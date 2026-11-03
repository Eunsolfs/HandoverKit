import { z } from "zod";

const captchaSchema = z.object({
  id: z.string().min(1),
  svg: z.string().min(1),
});

const errorBodySchema = z.object({
  error: z.string().min(1),
});

export interface CaptchaChallenge {
  id: string;
  svg: string;
}

export interface LoginInput {
  username: string;
  password: string;
  captchaId: string;
  captchaAnswer: string;
}

const FALLBACK_ERROR = "登录失败，请稍后重试";

const readErrorMessage = async (response: Response): Promise<string> => {
  try {
    const payload: unknown = await response.json();
    const parsed = errorBodySchema.safeParse(payload);

    if (parsed.success) {
      return parsed.data.error;
    }
  } catch {
    // 响应体不是 JSON（例如代理错误页）时退回通用文案。
  }

  if (response.status === 429) {
    return "尝试次数过多，请稍后再试";
  }

  return FALLBACK_ERROR;
};

/** 验证码一次性使用：每次登录失败后都需要重新获取。 */
export const fetchCaptcha = async (): Promise<CaptchaChallenge> => {
  const response = await fetch("/api/captcha", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error("验证码加载失败，请重试");
  }

  const payload: unknown = await response.json();
  const parsed = captchaSchema.safeParse(payload);

  if (!parsed.success) {
    throw new Error("验证码响应格式不正确");
  }

  return parsed.data;
};

export const loginWithPassword = async (input: LoginInput): Promise<void> => {
  const response = await fetch("/api/login", {
    body: JSON.stringify(input),
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (response.ok) {
    return;
  }

  throw new Error(await readErrorMessage(response));
};
