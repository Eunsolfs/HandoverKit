import { Link } from "@tanstack/react-router";

import { ModeToggle } from "#src/components/mode-toggle.tsx";
import { UserMenu } from "#src/components/user-menu.tsx";

export const Header = () => (
  <header className="border-border/60 bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
    <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
      <Link className="text-base font-semibold tracking-tight" to="/">
        易交接
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <ModeToggle />
        <UserMenu />
      </div>
    </div>
  </header>
);
