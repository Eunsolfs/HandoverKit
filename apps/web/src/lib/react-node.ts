import type { ReactNode } from "react";

/** ReactNode 可能是 null / undefined / 0 / ""；这里只判断「有没有内容要渲染」。 */
export const isPresent = (value: ReactNode): boolean =>
  value !== undefined && value !== null;
