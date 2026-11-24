"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tooltip } from "radix-ui";
import {
  DoorOpenIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  LogOutIcon,
  UserRoundIcon,
  ShieldCheckIcon,
  Link2Icon,
  UnlinkIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

export function Brand() {
  return (
    <Link
      href="/school"
      aria-label="바로룸 홈"
      className="focus-control inline-flex shrink-0 items-center gap-1.5 rounded-md sm:gap-2.5"
    >
      <DoorOpenIcon className="size-5 text-primary" strokeWidth={1.75} />
      <span className="type-heading-md sm:type-heading-lg">바로룸</span>
    </Link>
  );
}

export function AppHeader({
  name,
  role,
  active,
  connection,
}: {
  name: string;
  role: string;
  active: "school" | "history" | "schema" | "admin";
  connection?: { connected: boolean; autoLogin: boolean };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const ConnectionIcon = connection?.connected ? ShieldCheckIcon : UnlinkIcon;
  const connectionLabel = connection?.connected ? "학교 계정 연결됨" : "학교 계정 미연결";
  const loginLabel = connection?.connected
    ? connection.autoLogin ? "세션 만료 시 자동 로그인" : "세션 만료 시 다시 로그인 필요"
    : null;
  return (
    <header className="border-b bg-card/80">
      <div className="page-container flex h-14 max-w-6xl items-center gap-1.5 sm:gap-16">
        <Brand />
        <nav
          aria-label="주 메뉴"
          className="flex h-full items-center gap-2 sm:gap-7"
        >
          <Link
            href="/school"
            aria-current={active === "school" ? "page" : undefined}
            className={cn(
              "focus-control flex h-full items-center border-b-2 border-transparent type-label-md whitespace-nowrap text-muted-foreground hover:text-foreground",
              active === "school" && "border-primary text-foreground",
            )}
          >
            예약하기
          </Link>
          <Link
            href="/school?view=history"
            aria-current={
              active === "history" ? "page" : undefined
            }
            className={cn(
              "focus-control flex h-full items-center border-b-2 border-transparent type-label-md whitespace-nowrap text-muted-foreground hover:text-foreground",
              active === "history" &&
                "border-primary text-foreground",
            )}
          >
            내 예약
          </Link>
          <Link
            href="/school/schema"
            aria-current={active === "schema" ? "page" : undefined}
            className={cn(
              "focus-control flex h-full items-center border-b-2 border-transparent type-label-md whitespace-nowrap text-muted-foreground hover:text-foreground",
              active === "schema" && "border-primary text-foreground",
            )}
          >
            DB 구조
          </Link>
        </nav>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={busy} className="ml-auto shrink-0 max-sm:px-2" aria-label="내 계정 메뉴">
              <UserRoundIcon data-icon="inline-start" aria-hidden="true" />
              <span className="hidden max-w-24 truncate sm:inline">{name}</span>
              <ChevronDownIcon data-icon="inline-end" className="hidden sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="w-56 p-1.5"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center justify-between gap-2 px-2.5 py-2">
                <div className="flex min-w-0 items-center gap-1">
                  <span className="truncate">{name}</span>
                  {connection && (
                    <Tooltip.Provider delayDuration={350}>
                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                          <DropdownMenuItem
                            className={cn("size-6 shrink-0 justify-center p-0", connection.connected ? "text-primary" : "text-muted-foreground")}
                            aria-label={connectionLabel}
                            aria-description={loginLabel ?? undefined}
                            onSelect={(event) => event.preventDefault()}
                          >
                            <ConnectionIcon aria-hidden="true" className="size-3.5 text-current" />
                          </DropdownMenuItem>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content side="bottom" align="start" sideOffset={6}
                            className="z-50 rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-overlay">
                            <p className="type-label-sm">{connectionLabel}</p>
                            {loginLabel && <p className="mt-1 type-body-xs text-muted-foreground">{loginLabel}</p>}
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    </Tooltip.Provider>
                  )}
                </div>
                <Badge variant="secondary">
                  {role === "admin" ? "앱 관리자" : "학생"}
                </Badge>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/login?school=1">
                  <Link2Icon />
                  {connection?.connected
                    ? "학교 계정 다시 연결"
                    : "학교 계정 연결"}
                </Link>
              </DropdownMenuItem>
              {connection?.connected && (
                <DropdownMenuItem
                  disabled={busy}
                  onSelect={() => setDisconnectOpen(true)}
                >
                  <UnlinkIcon />
                  학교 연결 해제
                </DropdownMenuItem>
              )}
              {role === "admin" && (
                <DropdownMenuItem asChild>
                  <Link href="/">공간 관리</Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <a
                  href="https://dream.tukorea.ac.kr/nx/"
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLinkIcon />
                  학교 통합정보시스템
                </a>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                disabled={busy}
                onSelect={async () => {
                  setBusy(true);
                  try {
                    const response = await fetch("/api/logout", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: "{}",
                    });
                    if (!response.ok)
                      throw new Error(
                        "로그아웃하지 못했습니다. 다시 시도해주세요.",
                      );
                    router.replace("/login");
                    router.refresh();
                  } catch (e) {
                    toast.error(
                      e instanceof Error ? e.message : "연결을 확인해주세요.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <LogOutIcon />
                로그아웃
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>학교 계정 연결을 해제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              저장된 학교 세션과 자동 로그인 정보가 삭제됩니다. 학교 예약에는
              영향을 주지 않습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setBusy(true);
                try {
                  const response = await fetch("/api/school/connection", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                  });
                  if (!response.ok)
                    throw new Error(
                      "학교 연결을 해제하지 못했습니다. 다시 시도해주세요.",
                    );
                  router.refresh();
                } catch (e) {
                  toast.error(
                    e instanceof Error ? e.message : "연결을 확인해주세요.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              연결 해제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
