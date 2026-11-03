import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { SubmitEvent } from "react";
import { toast } from "sonner";

import { Button } from "@handoverkit/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@handoverkit/ui/components/dialog";
import { Input } from "@handoverkit/ui/components/input";
import { Textarea } from "@handoverkit/ui/components/textarea";

import { FormField } from "#src/components/app/form-field.tsx";
import { api } from "#src/lib/api.ts";

import { isErrorLike, optionalText } from "./shared.ts";
import type { TeamDto } from "./shared.ts";

interface TeamFormErrors {
  name?: string;
  code?: string;
  timezone?: string;
  form?: string;
}

interface TeamFormDialogProps {
  onOpenChange: (open: boolean) => void;
  /** null 表示新建团队。 */
  team: TeamDto | null;
}

const TEAM_CODE_PATTERN = /^[A-Z0-9-]+$/u;

/**
 * 页面按需挂载本组件（关闭即卸载），因此表单初值直接取自 props，
 * 不需要 effect 同步状态。
 */
export const TeamFormDialog = ({ onOpenChange, team }: TeamFormDialogProps) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState(team?.name ?? "");
  const [code, setCode] = useState(team?.code ?? "");
  const [description, setDescription] = useState(team?.description ?? "");
  const [timezone, setTimezone] = useState(team?.timezone ?? "Asia/Shanghai");
  const [errors, setErrors] = useState<TeamFormErrors>({});

  const refreshTeams = () => {
    void queryClient.invalidateQueries({
      queryKey: api.teams.key({ type: "query" }),
    });
    void queryClient.invalidateQueries({
      queryKey: api.me.key({ type: "query" }),
    });
  };

  const createTeam = useMutation({
    ...api.teams.create.mutationOptions(),
    onError: (error) => {
      setErrors({
        form: isErrorLike(error) ? error.message : "团队创建失败，请重试",
      });
    },
    onSuccess: () => {
      toast.success("团队已创建，可在顶部切换当前团队");
      refreshTeams();
      onOpenChange(false);
    },
  });

  const updateTeam = useMutation({
    ...api.teams.update.mutationOptions(),
    onError: (error) => {
      setErrors({
        form: isErrorLike(error) ? error.message : "团队更新失败，请重试",
      });
    },
    onSuccess: () => {
      toast.success("团队信息已更新");
      refreshTeams();
      onOpenChange(false);
    },
  });

  const pending = createTeam.isPending || updateTeam.isPending;

  const validate = (): boolean => {
    const next: TeamFormErrors = {};
    const trimmedName = name.trim();
    const trimmedCode = code.trim().toUpperCase();

    if (trimmedName.length === 0) {
      next.name = "请输入团队名称";
    } else if (trimmedName.length > 60) {
      next.name = "团队名称最多 60 个字符";
    }

    if (team === null) {
      if (trimmedCode.length < 2 || trimmedCode.length > 20) {
        next.code = "团队编码需为 2-20 个字符";
      } else if (!TEAM_CODE_PATTERN.test(trimmedCode)) {
        next.code = "团队编码只能包含大写字母、数字与短横线";
      }
    }

    if (timezone.trim().length === 0) {
      next.timezone = "请填写 IANA 时区，例如 Asia/Shanghai";
    }

    setErrors(next);

    return Object.keys(next).length === 0;
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    if (team === null) {
      createTeam.mutate({
        code: code.trim().toUpperCase(),
        description: optionalText(description),
        name: name.trim(),
        timezone: timezone.trim(),
      });

      return;
    }

    updateTeam.mutate({
      description: description.trim().length === 0 ? null : description.trim(),
      id: team.id,
      name: name.trim(),
      timezone: timezone.trim(),
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{team === null ? "新建团队" : "编辑团队"}</DialogTitle>
          <DialogDescription>
            团队拥有独立的成员、交接事项与物品仓库，跨团队数据互不可见。
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" noValidate onSubmit={handleSubmit}>
          {errors.form === undefined ? null : (
            <p className="text-destructive text-sm" role="alert">
              {errors.form}
            </p>
          )}

          <FormField
            error={errors.name}
            id="team-name"
            label="团队名称"
            required
          >
            {(field) => (
              <Input
                {...field}
                disabled={pending}
                maxLength={60}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                placeholder="例如 急诊科"
                value={name}
              />
            )}
          </FormField>

          <FormField
            error={errors.code}
            hint={
              team === null
                ? "2-20 位大写字母、数字或短横线，创建后不可修改"
                : "团队编码创建后不可修改"
            }
            id="team-code"
            label="团队编码"
            required={team === null}
          >
            {(field) => (
              <Input
                {...field}
                disabled={pending || team !== null}
                maxLength={20}
                onChange={(event) => {
                  setCode(event.target.value.toUpperCase());
                }}
                placeholder="例如 ER-01"
                value={code}
              />
            )}
          </FormField>

          <FormField
            error={errors.timezone}
            hint="IANA 时区，用于自然周/日期的计算"
            id="team-timezone"
            label="时区"
            required
          >
            {(field) => (
              <Input
                {...field}
                disabled={pending}
                maxLength={40}
                onChange={(event) => {
                  setTimezone(event.target.value);
                }}
                placeholder="Asia/Shanghai"
                value={timezone}
              />
            )}
          </FormField>

          <FormField id="team-description" label="描述">
            {(field) => (
              <Textarea
                {...field}
                disabled={pending}
                maxLength={200}
                onChange={(event) => {
                  setDescription(event.target.value);
                }}
                placeholder="选填，例如科室位置、交班负责人"
                value={description}
              />
            )}
          </FormField>

          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() => {
                onOpenChange(false);
              }}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button disabled={pending} type="submit">
              {pending ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
