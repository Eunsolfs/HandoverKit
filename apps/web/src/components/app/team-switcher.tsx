import { useQueryClient } from "@tanstack/react-query";
import { Building2Icon, ChevronDownIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@handoverkit/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@handoverkit/ui/components/dropdown-menu";

import { useActiveTeam } from "#src/lib/active-team.tsx";
import type { ActiveTeamOption } from "#src/lib/active-team.tsx";

interface TeamSwitcherProps {
  teams: ActiveTeamOption[];
}

export const TeamSwitcher = ({ teams }: TeamSwitcherProps) => {
  const { activeTeamId, setActiveTeamId } = useActiveTeam();
  const queryClient = useQueryClient();
  const activeTeam = teams.find((team) => team.id === activeTeamId);

  if (teams.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button aria-label="切换当前团队" size="sm" variant="outline" />
        }
      >
        <Building2Icon />
        <span className="max-w-28 truncate">
          {activeTeam?.name ?? "选择团队"}
        </span>
        <ChevronDownIcon className="text-muted-foreground size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>切换当前团队</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          onValueChange={(teamId: string) => {
            if (teamId === activeTeamId) {
              return;
            }

            setActiveTeamId(teamId);
            const nextTeam = teams.find((team) => team.id === teamId);
            toast.success(`已切换到 ${nextTeam?.name ?? "新团队"}`);
            void queryClient.invalidateQueries();
          }}
          value={activeTeamId ?? undefined}
        >
          {teams.map((team) => (
            <DropdownMenuRadioItem key={team.id} value={team.id}>
              {team.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
