import { ImageIcon } from "lucide-react";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@handoverkit/ui/components/dialog";
import { cn } from "@handoverkit/ui/lib/utils";

interface ItemThumbnailProps {
  imageUrl: string | null;
  itemName: string;
  className?: string;
}

/** 物品列表缩略图：无图显示占位，点击有图物品打开大图。 */
export const ItemThumbnail = ({
  className,
  imageUrl,
  itemName,
}: ItemThumbnailProps) => {
  const [open, setOpen] = useState(false);

  if (imageUrl === null) {
    return (
      <span
        aria-label={`${itemName} 暂无产品图`}
        className={cn(
          "bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md border",
          className
        )}
      >
        <ImageIcon aria-hidden="true" className="size-4" />
      </span>
    );
  }

  return (
    <>
      <button
        aria-label={`查看 ${itemName} 产品图`}
        className={cn(
          "focus-visible:ring-ring size-10 shrink-0 overflow-hidden rounded-md border transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:outline-none",
          className
        )}
        onClick={() => {
          setOpen(true);
        }}
        type="button"
      >
        <img
          alt={`${itemName} 产品图`}
          className="size-full object-cover"
          loading="lazy"
          src={imageUrl}
        />
      </button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{itemName}</DialogTitle>
          </DialogHeader>
          <img
            alt={`${itemName} 产品大图`}
            className="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg object-contain"
            src={imageUrl}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};
