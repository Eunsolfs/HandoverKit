import { randomUUID } from "node:crypto";

const TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface CaptchaEntry {
  code: string;
  expiresAt: number;
  attempts: number;
}

const store = new Map<string, CaptchaEntry>();

const purgeExpired = () => {
  const now = Date.now();

  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) {
      store.delete(key);
    }
  }
};

const randomCode = (length = 4) => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
};

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const renderSvg = (code: string) => {
  const width = 132;
  const height = 44;
  const colors = ["#0f766e", "#0e7490", "#155e75", "#065f46"];

  const chars = code
    .split("")
    .map((char, index) => {
      const x = 20 + index * 26;
      const y = 30 + (index % 2 === 0 ? -2 : 3);
      const rotate = (index % 2 === 0 ? -1 : 1) * (8 + ((index * 5) % 10));
      const color = colors[index % colors.length];

      return `<text x="${x}" y="${y}" font-family="Georgia, 'Times New Roman', serif" font-size="26" font-weight="700" fill="${color}" transform="rotate(${rotate} ${x} ${y})">${escapeXml(char)}</text>`;
    })
    .join("");

  const noise = Array.from({ length: 5 }, (_, index) => {
    const y1 = 6 + ((index * 13) % 32);
    const y2 = 6 + ((index * 19 + 7) % 32);

    return `<path d="M 4 ${y1} Q 40 ${(y1 + y2) / 2} 70 ${y2} T 128 ${(y1 + 9) % 38}" fill="none" stroke="#99f6e4" stroke-width="1" opacity="0.8"/>`;
  }).join("");

  const dots = Array.from({ length: 18 }, (_, index) => {
    const x = 4 + ((index * 37) % 124);
    const y = 4 + ((index * 23) % 36);

    return `<circle cx="${x}" cy="${y}" r="1" fill="#5eead4" opacity="0.7"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="图形验证码"><rect width="100%" height="100%" rx="10" fill="#f0fdfa"/>${dots}${noise}${chars}</svg>`;
};

export interface CaptchaChallenge {
  id: string;
  svg: string;
  expiresAt: number;
}

/** 生成一次性图形验证码（内存存储，单实例部署；5 分钟过期）。 */
export const createCaptcha = (): CaptchaChallenge => {
  purgeExpired();
  const id = randomUUID();
  const code = randomCode();
  const expiresAt = Date.now() + TTL_MS;
  store.set(id, { attempts: 0, code, expiresAt });

  return { expiresAt, id, svg: renderSvg(code) };
};

/** 校验并消费验证码；错误次数达到上限后立即失效。 */
export const verifyCaptcha = (id: string, answer: string): boolean => {
  purgeExpired();
  const entry = store.get(id);

  if (!entry) {
    return false;
  }

  entry.attempts += 1;

  if (entry.attempts > MAX_ATTEMPTS) {
    store.delete(id);

    return false;
  }

  const ok = answer.trim().toUpperCase() === entry.code.toUpperCase();

  if (ok || entry.attempts >= MAX_ATTEMPTS) {
    store.delete(id);
  }

  return ok;
};

export const CAPTCHA_TTL_MS = TTL_MS;
