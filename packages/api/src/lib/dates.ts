import { z } from "zod";

const DAY_MS = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export type StatsPeriod = "week" | "month" | "year";

export interface DateRange {
  start: string;
  end: string;
}

const toUtcDate = (value: string): Date => {
  const parts = value.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  return new Date(Date.UTC(year, month - 1, day));
};

const formatUtcDate = (date: Date): string => date.toISOString().slice(0, 10);

/** 校验 YYYY-MM-DD 是否为真实存在的日历日期。 */
const isCalendarDate = (value: string): boolean => {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const parsed = toUtcDate(value);

  return !Number.isNaN(parsed.getTime()) && formatUtcDate(parsed) === value;
};

/** 团队时区下的“今天”，返回 YYYY-MM-DD。 */
export const todayInTimeZone = (
  timeZone: string,
  now: Date = new Date()
): string => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  });

  const parts = new Map(
    formatter.formatToParts(now).map((part) => [part.type, part.value])
  );

  const year = parts.get("year");
  const month = parts.get("month");
  const day = parts.get("day");

  if (year === undefined || month === undefined || day === undefined) {
    throw new Error("无法解析时区日期");
  }

  return `${year}-${month}-${day}`;
};

export const isValidTimeZone = (timeZone: string): boolean => {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", { timeZone });

    return formatter.resolvedOptions().timeZone.length > 0;
  } catch {
    return false;
  }
};

const addDays = (value: string, days: number): string =>
  formatUtcDate(new Date(toUtcDate(value).getTime() + days * DAY_MS));

/** 周一为 1，周日为 7。 */
const isoWeekday = (value: string): number => {
  const weekday = toUtcDate(value).getUTCDay();

  return weekday === 0 ? 7 : weekday;
};

/** 按团队日历日计算自然周 / 自然月 / 自然年的起止日期。 */
export const periodRange = (
  period: StatsPeriod,
  anchorDate: string
): DateRange => {
  switch (period) {
    case "week": {
      const start = addDays(anchorDate, 1 - isoWeekday(anchorDate));

      return { end: addDays(start, 6), start };
    }

    case "month": {
      const parts = anchorDate.split("-");
      const year = Number(parts[0]);
      const month = Number(parts[1]);
      const lastDay = new Date(Date.UTC(year, month, 0));

      return {
        end: formatUtcDate(lastDay),
        start: `${anchorDate.slice(0, 7)}-01`,
      };
    }

    case "year": {
      const year = anchorDate.slice(0, 4);

      return { end: `${year}-12-31`, start: `${year}-01-01` };
    }

    default: {
      const year = anchorDate.slice(0, 4);

      return { end: `${year}-12-31`, start: `${year}-01-01` };
    }
  }
};

/** 区间内每一天（含首尾），用于统计按日补齐。 */
export const daysInRange = (range: DateRange): string[] => {
  const days: string[] = [];
  let cursor = range.start;

  while (cursor <= range.end) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return days;
};

export const calendarDateSchema = z
  .string()
  .refine(isCalendarDate, "日期格式应为 YYYY-MM-DD");
