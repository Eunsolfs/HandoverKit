import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
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

import { FormField } from "#src/components/app/form-field.tsx";
import { api } from "#src/lib/api.ts";

interface PasswordErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
  form?: string;
}

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ChangePasswordDialog = ({
  onOpenChange,
  open,
}: ChangePasswordDialogProps) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<PasswordErrors>({});

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setErrors({});
  };

  const mutation = useMutation({
    ...api.me.changePassword.mutationOptions(),
    onError: (error) => {
      setErrors({ form: error.message });
    },
    onSuccess: () => {
      toast.success("密码已更新，请使用新密码重新登录");
      reset();
      onOpenChange(false);
    },
  });

  const handleOpenChange = (next: boolean) => {
    if (!next && mutation.isPending) {
      return;
    }

    if (!next) {
      reset();
    }

    onOpenChange(next);
  };

  const validate = (): boolean => {
    const next: PasswordErrors = {};

    if (currentPassword.length === 0) {
      next.currentPassword = "请输入当前密码";
    }

    if (newPassword.length < 8) {
      next.newPassword = "新密码至少 8 位";
    } else if (!/[a-zA-Z]/u.test(newPassword) || !/[0-9]/u.test(newPassword)) {
      next.newPassword = "新密码需同时包含字母和数字";
    }

    if (confirmPassword !== newPassword) {
      next.confirmPassword = "两次输入的密码不一致";
    }

    setErrors(next);

    return Object.keys(next).length === 0;
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>修改密码</DialogTitle>
          <DialogDescription>
            新密码至少 8 位，且需同时包含字母和数字。
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();

            if (!validate()) {
              return;
            }

            mutation.mutate({ currentPassword, newPassword });
          }}
        >
          {errors.form === undefined ? null : (
            <p className="text-destructive text-sm" role="alert">
              {errors.form}
            </p>
          )}
          <FormField
            error={errors.currentPassword}
            id="change-password-current"
            label="当前密码"
            required
          >
            {(field) => (
              <Input
                {...field}
                autoComplete="current-password"
                disabled={mutation.isPending}
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                }}
                type="password"
                value={currentPassword}
              />
            )}
          </FormField>
          <FormField
            error={errors.newPassword}
            id="change-password-new"
            label="新密码"
            required
          >
            {(field) => (
              <Input
                {...field}
                autoComplete="new-password"
                disabled={mutation.isPending}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                }}
                type="password"
                value={newPassword}
              />
            )}
          </FormField>
          <FormField
            error={errors.confirmPassword}
            id="change-password-confirm"
            label="确认新密码"
            required
          >
            {(field) => (
              <Input
                {...field}
                autoComplete="new-password"
                disabled={mutation.isPending}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                }}
                type="password"
                value={confirmPassword}
              />
            )}
          </FormField>
          <DialogFooter className="mt-1">
            <Button
              disabled={mutation.isPending}
              onClick={() => {
                handleOpenChange(false);
              }}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button disabled={mutation.isPending} type="submit">
              {mutation.isPending ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
