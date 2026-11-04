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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@handoverkit/ui/components/select";

import { ConfirmDialog } from "#src/components/app/confirm-dialog.tsx";
import { FormField } from "#src/components/app/form-field.tsx";
import { api } from "#src/lib/api.ts";
import type { AppRole } from "#src/lib/roles.ts";

import {
  creatableRoles,
  isErrorLike,
  nullableText,
  optionalText,
  toTeamOptions,
  validatePassword,
  validateUsername,
} from "./shared.ts";
import type { ProfileDto } from "./shared.ts";

interface UserFormErrors {
  username?: string;
  name?: string;
  password?: string;
  confirmPassword?: string;
  phone?: string;
  teamId?: string;
  form?: string;
}

interface TeamSource {
  id: string;
  name: string;
}

const STATUS_OPTIONS = [
  { label: "启用", value: "active" },
  { label: "停用", value: "disabled" },
];

interface UserCreateDialogProps {
  onOpenChange: (open: boolean) => void;
  role: AppRole;
  teams: readonly TeamSource[];
  /** 超级管理员默认选中的团队（顶栏当前团队）。 */
  defaultTeamId: string | null;
}

export const UserCreateDialog = ({
  defaultTeamId,
  onOpenChange,
  role,
  teams,
}: UserCreateDialogProps) => {
  const queryClient = useQueryClient();
  const isSuper = role === "super_admin";
  const teamOptions = toTeamOptions(teams);
  const roleOptions = creatableRoles(role);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [roleValue, setRoleValue] = useState<"team_admin" | "member">("member");
  const [phone, setPhone] = useState("");
  const [teamId, setTeamId] = useState(defaultTeamId ?? teams[0]?.id ?? "");
  const [errors, setErrors] = useState<UserFormErrors>({});

  const createUser = useMutation({
    ...api.users.create.mutationOptions(),
    onError: (error) => {
      setErrors({
        form: isErrorLike(error) ? error.message : "账号创建失败，请重试",
      });
    },
    onSuccess: () => {
      toast.success("账号已创建");
      void queryClient.invalidateQueries({
        queryKey: api.users.key({ type: "query" }),
      });
      void queryClient.invalidateQueries({
        queryKey: api.teams.key({ type: "query" }),
      });
      onOpenChange(false);
    },
  });

  const pending = createUser.isPending;

  const validate = (): boolean => {
    const next: UserFormErrors = {};

    const usernameError = validateUsername(username);

    if (usernameError !== null) {
      next.username = usernameError;
    }

    if (name.trim().length === 0) {
      next.name = "请输入姓名";
    }

    const passwordError = validatePassword(password);

    if (passwordError !== null) {
      next.password = passwordError;
    }

    if (confirmPassword !== password) {
      next.confirmPassword = "两次输入的密码不一致";
    }

    const trimmedPhone = phone.trim();

    if (trimmedPhone.length > 0 && !/^[0-9+\-\s]{6,20}$/u.test(trimmedPhone)) {
      next.phone = "手机号格式不正确";
    }

    if (isSuper && teamId.length === 0) {
      next.teamId = "请选择所属团队";
    }

    setErrors(next);

    return Object.keys(next).length === 0;
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    createUser.mutate({
      name: name.trim(),
      password,
      phone: optionalText(phone),
      role: roleValue,
      teamId: isSuper ? teamId : undefined,
      username: username.trim().toLowerCase(),
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>新建账号</DialogTitle>
          <DialogDescription>
            {isSuper
              ? "超级管理员可为任意团队创建团队管理员或普通成员。"
              : "团队管理员只能为本团队创建普通成员账号。"}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={handleSubmit}
        >
          {errors.form === undefined ? null : (
            <p className="text-destructive text-sm" role="alert">
              {errors.form}
            </p>
          )}

          <FormField
            error={errors.username}
            hint="登录系统使用，3-30 位字母、数字、下划线或点"
            id="user-username"
            label="登录名"
            required
          >
            {(field) => (
              <Input
                {...field}
                autoComplete="off"
                disabled={pending}
                maxLength={30}
                onChange={(event) => {
                  setUsername(event.target.value);
                }}
                placeholder="例如 zhang_san"
                value={username}
              />
            )}
          </FormField>

          <FormField error={errors.name} id="user-name" label="姓名" required>
            {(field) => (
              <Input
                {...field}
                disabled={pending}
                maxLength={40}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                placeholder="真实姓名"
                value={name}
              />
            )}
          </FormField>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              error={errors.password}
              id="user-password"
              label="初始密码"
              required
            >
              {(field) => (
                <Input
                  {...field}
                  autoComplete="new-password"
                  disabled={pending}
                  maxLength={128}
                  onChange={(event) => {
                    setPassword(event.target.value);
                  }}
                  type="password"
                  value={password}
                />
              )}
            </FormField>

            <FormField
              error={errors.confirmPassword}
              id="user-confirm-password"
              label="确认密码"
              required
            >
              {(field) => (
                <Input
                  {...field}
                  autoComplete="new-password"
                  disabled={pending}
                  maxLength={128}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                  }}
                  type="password"
                  value={confirmPassword}
                />
              )}
            </FormField>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="user-role" label="角色" required>
              {(field) => (
                <Select
                  disabled={pending}
                  items={roleOptions}
                  onValueChange={(next: string | null) => {
                    if (next === "team_admin" || next === "member") {
                      setRoleValue(next);
                    }
                  }}
                  value={roleValue}
                >
                  <SelectTrigger className="w-full" id={field.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>

            <FormField
              error={errors.phone}
              hint="选填，便于联系"
              id="user-phone"
              label="手机号"
            >
              {(field) => (
                <Input
                  {...field}
                  disabled={pending}
                  inputMode="tel"
                  maxLength={20}
                  onChange={(event) => {
                    setPhone(event.target.value);
                  }}
                  placeholder="手机号"
                  value={phone}
                />
              )}
            </FormField>
          </div>

          {isSuper ? (
            <FormField
              error={errors.teamId}
              id="user-team"
              label="所属团队"
              required
            >
              {(field) => (
                <Select
                  disabled={pending}
                  items={teamOptions.map((team) => ({
                    label: team.name,
                    value: team.id,
                  }))}
                  onValueChange={(next: string | null) => {
                    if (next !== null) {
                      setTeamId(next);
                    }
                  }}
                  value={teamId}
                >
                  <SelectTrigger className="w-full" id={field.id}>
                    <SelectValue placeholder="选择团队" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamOptions.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          ) : null}

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
              {pending ? "创建中…" : "创建账号"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

interface UserEditDialogProps {
  onOpenChange: (open: boolean) => void;
  user: ProfileDto;
  role: AppRole;
  teams: readonly TeamSource[];
  currentUserId: string;
}

export const UserEditDialog = ({
  currentUserId,
  onOpenChange,
  role,
  teams,
  user,
}: UserEditDialogProps) => {
  const queryClient = useQueryClient();
  const isSuper = role === "super_admin";
  const teamOptions = toTeamOptions(teams);
  const roleOptions = creatableRoles(role);
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [status, setStatus] = useState<"active" | "disabled">(user.status);

  const [roleValue, setRoleValue] = useState<"team_admin" | "member">(
    user.role === "member" ? "member" : "team_admin"
  );

  const [teamId, setTeamId] = useState(user.teamId ?? "");
  const [errors, setErrors] = useState<UserFormErrors>({});

  const isSelf = user.id === currentUserId;
  const canEditRole = isSuper && !isSelf && user.role !== "super_admin";
  const canEditTeam = isSuper && !isSelf;

  const updateUser = useMutation({
    ...api.users.update.mutationOptions(),
    onError: (error) => {
      setErrors({
        form: isErrorLike(error) ? error.message : "账号更新失败，请重试",
      });
    },
    onSuccess: () => {
      toast.success("账号信息已更新");
      void queryClient.invalidateQueries({
        queryKey: api.users.key({ type: "query" }),
      });
      onOpenChange(false);
    },
  });

  const pending = updateUser.isPending;

  const validate = (): boolean => {
    const next: UserFormErrors = {};

    if (name.trim().length === 0) {
      next.name = "请输入姓名";
    }

    const trimmedPhone = phone.trim();

    if (trimmedPhone.length > 0 && !/^[0-9+\-\s]{6,20}$/u.test(trimmedPhone)) {
      next.phone = "手机号格式不正确";
    }

    setErrors(next);

    return Object.keys(next).length === 0;
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    updateUser.mutate({
      id: user.id,
      name: name.trim(),
      phone: nullableText(phone),
      role: canEditRole ? roleValue : undefined,
      status,
      teamId: canEditTeam && teamId.length > 0 ? teamId : undefined,
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>编辑账号</DialogTitle>
          <DialogDescription>
            {isSelf
              ? "可以修改自己的姓名与手机号，但不能修改自己的角色与账号状态。"
              : "可修改姓名、手机号、账号状态；调整角色或团队请谨慎操作。"}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={handleSubmit}
        >
          {errors.form === undefined ? null : (
            <p className="text-destructive text-sm" role="alert">
              {errors.form}
            </p>
          )}

          <FormField
            error={errors.name}
            id="edit-user-name"
            label="姓名"
            required
          >
            {(field) => (
              <Input
                {...field}
                disabled={pending}
                maxLength={40}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                value={name}
              />
            )}
          </FormField>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              error={errors.phone}
              hint="选填，便于联系"
              id="edit-user-phone"
              label="手机号"
            >
              {(field) => (
                <Input
                  {...field}
                  disabled={pending}
                  inputMode="tel"
                  maxLength={20}
                  onChange={(event) => {
                    setPhone(event.target.value);
                  }}
                  placeholder="手机号"
                  value={phone}
                />
              )}
            </FormField>

            <FormField
              hint={isSelf ? "不能修改自己的账号状态" : undefined}
              id="edit-user-status"
              label="账号状态"
            >
              {(field) => (
                <Select
                  disabled={pending || isSelf}
                  items={STATUS_OPTIONS}
                  onValueChange={(next: string | null) => {
                    if (next === "active" || next === "disabled") {
                      setStatus(next);
                    }
                  }}
                  value={status}
                >
                  <SelectTrigger className="w-full" id={field.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          </div>

          {canEditRole ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="edit-user-role" label="角色">
                {(field) => (
                  <Select
                    disabled={pending}
                    items={roleOptions}
                    onValueChange={(next: string | null) => {
                      if (next === "team_admin" || next === "member") {
                        setRoleValue(next);
                      }
                    }}
                    value={roleValue}
                  >
                    <SelectTrigger className="w-full" id={field.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>

              {canEditTeam ? (
                <FormField id="edit-user-team" label="所属团队">
                  {(field) => (
                    <Select
                      disabled={pending}
                      items={teamOptions.map((team) => ({
                        label: team.name,
                        value: team.id,
                      }))}
                      onValueChange={(next: string | null) => {
                        if (next !== null) {
                          setTeamId(next);
                        }
                      }}
                      value={teamId}
                    >
                      <SelectTrigger className="w-full" id={field.id}>
                        <SelectValue placeholder="选择团队" />
                      </SelectTrigger>
                      <SelectContent>
                        {teamOptions.map((team) => (
                          <SelectItem key={team.id} value={team.id}>
                            {team.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
              ) : null}
            </div>
          ) : null}

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

interface ResetPasswordDialogProps {
  onOpenChange: (open: boolean) => void;
  user: ProfileDto;
}

export const ResetPasswordDialog = ({
  onOpenChange,
  user,
}: ResetPasswordDialogProps) => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<UserFormErrors>({});

  const resetPassword = useMutation({
    ...api.users.resetPassword.mutationOptions(),
    onError: (error) => {
      setErrors({
        form: isErrorLike(error) ? error.message : "密码重置失败，请重试",
      });
    },
    onSuccess: () => {
      toast.success("密码已重置，请通知对方使用新密码登录");
      onOpenChange(false);
    },
  });

  const pending = resetPassword.isPending;

  const validate = (): boolean => {
    const next: UserFormErrors = {};
    const passwordError = validatePassword(password);

    if (passwordError !== null) {
      next.password = passwordError;
    }

    if (confirmPassword !== password) {
      next.confirmPassword = "两次输入的密码不一致";
    }

    setErrors(next);

    return Object.keys(next).length === 0;
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    resetPassword.mutate({ id: user.id, newPassword: password });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>重置密码</DialogTitle>
          <DialogDescription>
            将重置 {user.name} 的登录密码。对方需要重新登录。
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={handleSubmit}
        >
          {errors.form === undefined ? null : (
            <p className="text-destructive text-sm" role="alert">
              {errors.form}
            </p>
          )}

          <FormField
            error={errors.password}
            hint="至少 4 位"
            id="reset-user-password"
            label="新密码"
            required
          >
            {(field) => (
              <Input
                {...field}
                autoComplete="new-password"
                disabled={pending}
                maxLength={128}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
                type="password"
                value={password}
              />
            )}
          </FormField>

          <FormField
            error={errors.confirmPassword}
            id="reset-user-confirm-password"
            label="确认新密码"
            required
          >
            {(field) => (
              <Input
                {...field}
                autoComplete="new-password"
                disabled={pending}
                maxLength={128}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                }}
                type="password"
                value={confirmPassword}
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
              {pending ? "重置中…" : "重置密码"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

interface UserDeleteDialogProps {
  onOpenChange: (open: boolean) => void;
  user: ProfileDto;
}

export const UserDeleteDialog = ({
  onOpenChange,
  user,
}: UserDeleteDialogProps) => {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const removeUser = useMutation({
    ...api.users.remove.mutationOptions(),
    onError: (mutationError) => {
      setError(
        isErrorLike(mutationError)
          ? mutationError.message
          : "删除失败，请稍后重试"
      );
    },
    onSuccess: () => {
      toast.success("账号已删除");
      void queryClient.invalidateQueries({
        queryKey: api.users.key({ type: "query" }),
      });
      void queryClient.invalidateQueries({
        queryKey: api.teams.key({ type: "query" }),
      });
      onOpenChange(false);
    },
  });

  return (
    <ConfirmDialog
      confirmLabel="确认删除"
      description={
        error === null ? (
          `删除后 ${user.name} 将无法登录。若后端检测到该用户已有业务记录，会提示改为停用。`
        ) : (
          <span className="text-destructive">{error}</span>
        )
      }
      destructive
      onConfirm={() => {
        removeUser.mutate({ id: user.id });
      }}
      onOpenChange={onOpenChange}
      open
      pending={removeUser.isPending}
      title="删除账号"
    />
  );
};
