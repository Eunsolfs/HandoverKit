import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

const STORAGE_KEY = "handoverkit.active-team-id";

export interface ActiveTeamOption {
  id: string;
  name: string;
}

interface ActiveTeamContextValue {
  activeTeamId: string | null;
  teams: ActiveTeamOption[];
  setActiveTeamId: (teamId: string) => void;
}

const ActiveTeamContext = createContext<ActiveTeamContextValue | null>(null);

const readStoredTeamId = (): string | null => {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // 隐私模式或禁用存储时退回默认团队。
    return null;
  }
};

const persistTeamId = (teamId: string): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, teamId);
  } catch {
    // 仅影响刷新后的记忆，不阻断切换。
  }
};

interface ActiveTeamProviderProps {
  teams: ActiveTeamOption[];
  defaultTeamId: string | null;
  /** 只有超级管理员可以切换团队；其他角色固定为自己的团队。 */
  allowSwitch: boolean;
  children: ReactNode;
}

export const ActiveTeamProvider = ({
  allowSwitch,
  children,
  defaultTeamId,
  teams,
}: ActiveTeamProviderProps) => {
  const [activeTeamId, setActiveTeamId] = useState<string | null>(() => {
    if (!allowSwitch) {
      return defaultTeamId;
    }

    const stored = readStoredTeamId();

    return stored !== null && teams.some((team) => team.id === stored)
      ? stored
      : defaultTeamId;
  });

  const value = useMemo<ActiveTeamContextValue>(
    () => ({
      activeTeamId,
      setActiveTeamId: (teamId: string) => {
        persistTeamId(teamId);
        setActiveTeamId(teamId);
      },
      teams,
    }),
    [activeTeamId, teams]
  );

  return (
    <ActiveTeamContext.Provider value={value}>
      {children}
    </ActiveTeamContext.Provider>
  );
};

export const useActiveTeam = (): ActiveTeamContextValue => {
  const context = useContext(ActiveTeamContext);

  if (context === null) {
    throw new Error("useActiveTeam 必须在 ActiveTeamProvider 内使用");
  }

  return context;
};
