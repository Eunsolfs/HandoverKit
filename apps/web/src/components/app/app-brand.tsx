import { HeartPulseIcon } from "lucide-react";

import { AppLink } from "#src/components/app/app-link.tsx";

export const AppBrand = () => (
  <AppLink className="flex min-h-11 items-center gap-2.5" href="/">
    <span
      aria-hidden="true"
      className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-xl shadow-sm"
    >
      <HeartPulseIcon className="size-5" />
    </span>
    <span className="grid leading-tight">
      <span className="text-sm font-semibold tracking-tight">易交接</span>
      <span className="text-muted-foreground text-xs">HandoverKit</span>
    </span>
  </AppLink>
);
