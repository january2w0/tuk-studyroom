"use client";

import { CircleAlertIcon, XIcon } from "lucide-react";
import { Toaster as SonnerToaster } from "sonner";
import { buttonVariants } from "@/components/ui/button";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      offset={{ top: 68 }}
      mobileOffset={{ top: 68 }}
      containerAriaLabel="예약 알림"
      closeButton
      icons={{
        error: <CircleAlertIcon className="size-4" />,
        close: <XIcon />,
      }}
      toastOptions={{
        unstyled: true,
        closeButtonAriaLabel: "알림 닫기",
        classNames: {
          toast: "group/toast focus-control flex w-full items-center gap-3 rounded-lg border border-boundary-default bg-surface-panel py-2 pl-4 pr-2 font-sans text-foreground shadow-overlay",
          content: "min-w-0 flex-1",
          title: "type-body-md",
          icon: "shrink-0",
          error:
            "data-[type=error]:border-[color-mix(in_srgb,var(--destructive)_24%,var(--boundary-default))] data-[type=error]:bg-[color-mix(in_srgb,var(--destructive)_8%,var(--surface-panel))] [&_[data-icon]]:text-destructive [&_[data-title]]:text-destructive",
          closeButton: buttonVariants({
            variant: "ghost",
            size: "icon-sm",
            className:
              "order-last text-muted-foreground group-data-[type=error]/toast:hover:bg-destructive/10 group-data-[type=error]/toast:hover:text-destructive",
          }),
        },
      }}
    />
  );
}
