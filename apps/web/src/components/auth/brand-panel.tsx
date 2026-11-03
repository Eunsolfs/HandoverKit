// 版式参考 Watermelon UI（https://ui.watermelon.sh）auth-02/auth-04 区块，MIT License。
import { ClipboardCheckIcon, FileCheck2Icon, ScanLineIcon } from "lucide-react";

import { AppBrand } from "#src/components/app/app-brand.tsx";

const FEATURES = [
  {
    description: "按当前库存生成当日清单，逐项核对后确认接收。",
    icon: ClipboardCheckIcon,
    title: "接班有据",
  },
  {
    description: "用物登记到患者、操作员与日期，撤销必须走审批。",
    icon: ScanLineIcon,
    title: "用物可追溯",
  },
  {
    description: "交班前再次核对，形成完整的用物交接表。",
    icon: FileCheck2Icon,
    title: "交班有表",
  },
];

export const BrandPanel = () => (
  <div className="bg-primary/[0.04] relative hidden overflow-hidden border-r lg:flex lg:flex-col lg:justify-between lg:p-12">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="border-primary/15 absolute -top-28 -right-28 size-80 rounded-full border" />
      <div className="border-primary/15 absolute -top-10 -right-10 size-52 rounded-full border" />
      <div className="bg-primary/10 absolute bottom-20 left-8 size-40 rotate-12 rounded-3xl" />
      <div className="bg-primary/20 absolute top-1/3 left-1/2 size-1.5 rounded-full" />
      <div className="bg-primary/20 absolute top-1/4 left-2/3 size-1.5 rounded-full" />
      <div className="bg-primary/20 absolute bottom-1/3 left-1/3 size-1.5 rounded-full" />
    </div>

    <div className="relative">
      <AppBrand />
    </div>

    <div className="relative max-w-md space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance">
          让每一次交接
          <br />
          都有据可查
        </h1>
        <p className="text-muted-foreground text-sm text-pretty">
          扫码完成接班核对、用物登记与交班留痕，库存与患者信息全程可追溯。
        </p>
      </div>
      <ul className="grid gap-4">
        {FEATURES.map((feature) => (
          <li className="flex items-start gap-3" key={feature.title}>
            <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
              <feature.icon aria-hidden="true" className="size-4" />
            </span>
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">{feature.title}</span>
              <span className="text-muted-foreground text-sm">
                {feature.description}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>

    <p className="text-muted-foreground relative text-xs">
      易交接 HandoverKit · 医疗用物与交接记录系统
    </p>
  </div>
);
