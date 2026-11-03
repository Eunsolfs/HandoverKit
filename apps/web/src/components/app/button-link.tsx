import type { ReactNode } from "react";

import { buttonVariants } from "@handoverkit/ui/components/button";
import { cn } from "@handoverkit/ui/lib/utils";

import { AppLink } from "#src/components/app/app-link.tsx";

type ButtonLinkVariant =
  | "default"
  | "outline"
  | "secondary"
  | "ghost"
  | "destructive"
  | "link";

type ButtonLinkSize =
  | "default"
  | "xs"
  | "sm"
  | "lg"
  | "icon"
  | "icon-xs"
  | "icon-sm"
  | "icon-lg";

interface ButtonLinkProps {
  href: string;
  children: ReactNode;
  variant?: ButtonLinkVariant;
  size?: ButtonLinkSize;
  className?: string;
  "aria-label"?: string;
}

/** 需要按钮外观的站内链接：复用 Button 的 variant 样式，保持 SPA 导航。 */
export const ButtonLink = ({
  "aria-label": ariaLabel,
  children,
  className,
  href,
  size = "default",
  variant = "default",
}: ButtonLinkProps) => (
  <AppLink
    aria-label={ariaLabel}
    className={cn(buttonVariants({ size, variant }), className)}
    href={href}
  >
    {children}
  </AppLink>
);
