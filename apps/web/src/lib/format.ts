const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const weekdayFormatter = new Intl.DateTimeFormat("zh-CN", {
  weekday: "long",
});

const pad = (value: number): string => String(value).padStart(2, "0");

/** 时间戳按浏览器本地时区格式化；null/undefined 用占位符，避免表格出现 undefined。 */
export const formatDateTime = (value?: number | null): string =>
  value === null || value === undefined
    ? "—"
    : dateTimeFormatter.format(new Date(value));

const formatDate = (value?: number | null): string =>
  value === null || value === undefined
    ? "—"
    : dateFormatter.format(new Date(value));

export const formatFullToday = (date: Date = new Date()): string =>
  `${dateFormatter.format(date)} ${weekdayFormatter.format(date)}`;

/** 业务日期统一用 YYYY-MM-DD（团队时区），不用 toISOString 以免 UTC 偏移跨日。 */
export const toLocalDateString = (date: Date = new Date()): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** 记录日期字符串（YYYY-MM-DD）转中文展示。 */
export const formatRecordDate = (value: string): string =>
  formatDate(new Date(`${value}T00:00:00`).getTime());
