"use client";

import { useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export const schoolRequestToastId = "school-request";

export function showRequestError(message: string, id: string, requiresLogin = false) {
  toast.error(message, {
    id,
    duration: requiresLogin ? Infinity : 5000,
    action: requiresLogin ? (
      <Button
        variant="outline"
        size="sm"
        className="border-destructive/25 bg-destructive/5 text-destructive hover:border-destructive/40 hover:bg-destructive/10 focus-visible:border-destructive focus-visible:ring-destructive/30"
        asChild
      >
        <Link href="/login?school=1" onClick={() => toast.dismiss(id)}>다시 로그인</Link>
      </Button>
    ) : undefined,
  });
}

export function RequestErrorToast({ message, id = schoolRequestToastId, requiresLogin = false }: {
  message?: string;
  id?: string;
  requiresLogin?: boolean;
}) {
  useEffect(() => {
    if (message) showRequestError(message, id, requiresLogin);
  }, [message, id, requiresLogin]);
  return null;
}
