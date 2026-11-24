"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Clock3Icon, CopyIcon, DoorOpenIcon, FileTextIcon, SearchIcon, Settings2Icon } from "lucide-react";
import type { User } from "@/lib/auth";
import type { Room, SavedDraft } from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { DatePicker } from "@/components/form-controls";
import { RequestErrorToast } from "@/components/request-error-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Field, FieldLabel } from "@/components/ui/field";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";

const panelClass = "flex flex-col rounded-lg border bg-card";
const panelHeaderClass = "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-t-lg border-b bg-surface-section px-4 py-4 sm:px-5";

async function copyDraft(draft: SavedDraft) {
  try {
    await navigator.clipboard.writeText(
      `${draft.roomName}\n${draft.date} ${draft.start}~${draft.end}\n${draft.purpose}\n참여 ${draft.attendees}명`,
    );
    toast.success("내용을 복사했습니다.");
  } catch {
    toast.error("복사할 수 없습니다. 내용을 직접 확인해주세요.");
  }
}

export default function Workspace({
  user, rooms, drafts, filters, searchError, initialView,
}: {
  user: User;
  rooms: Room[];
  drafts: SavedDraft[];
  filters: { q: string; date: string };
  searchError: string;
  initialView: "admin" | "drafts";
}) {
  const router = useRouter();
  const [tab, setTab] = useState(initialView);
  const [updatingRoom, setUpdatingRoom] = useState<number | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const hasFilters = Boolean(filters.q || filters.date || searchError);

  async function toggleRoom(room: Room) {
    setUpdatingRoom(room.id);
    try {
      const res = await fetch("/api/rooms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: room.id, enabled: !room.enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("공간 설정을 변경했습니다.");
      startRefresh(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "연결을 확인해주세요.");
    } finally {
      setUpdatingRoom(null);
    }
  }

  return (
    <div className="school-shell">
      <div className="school-atmosphere" aria-hidden="true" />
      <AppHeader name={user.display_name} role={user.role} active="admin" />
      <main className="page-container flex max-w-6xl flex-col gap-6 py-6 sm:gap-7 sm:pt-7 sm:pb-9">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <h1 className="type-display-md">관리자</h1>
          <ToggleGroup
            type="single"
            variant="outline"
            value={tab}
            onValueChange={(value) => {
              if (value === "drafts" || value === "admin") setTab(value);
            }}
            aria-label="관리 메뉴"
            className="max-w-full bg-muted [&>[data-state=on]]:bg-interaction-selected"
          >
            <ToggleGroupItem value="admin">
              <Settings2Icon aria-hidden="true" />
              공간 관리
            </ToggleGroupItem>
            <ToggleGroupItem value="drafts">
              <FileTextIcon aria-hidden="true" />
              임시 저장
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {tab === "admin" ? (
          <section aria-labelledby="admin-rooms-title" className={panelClass}>
            <div className={panelHeaderClass}>
              <div className="flex flex-col gap-1">
                <h2 id="admin-rooms-title" className="type-heading-md">공간별 임시 저장 설정</h2>
                <p className="type-body-sm text-muted-foreground">학생의 예약 양식 임시 저장에 적용됩니다.</p>
              </div>
              <span className="type-body-sm text-muted-foreground tabular-nums">공간 {rooms.length}개</span>
            </div>
            {rooms.length > 0 ? (
              <ul className="divide-y">
                {rooms.map((room) => (
                  <li key={room.id} className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-3 px-4 py-4 sm:grid-cols-[2.5rem_minmax(0,1fr)_7rem_auto] sm:items-center sm:gap-x-4 sm:px-5">
                    <span className="grid size-10 place-items-center rounded-md bg-accent text-primary" aria-hidden="true">
                      <DoorOpenIcon className="size-5" />
                    </span>
                    <div className="flex min-w-0 flex-col gap-1">
                      <h3 className="type-heading-sm wrap-anywhere">{room.name}</h3>
                      <p className="type-body-sm text-muted-foreground">{room.location}</p>
                    </div>
                    <div className="col-start-2 row-start-2 self-center justify-self-start sm:col-start-3 sm:row-start-1">
                      <Badge variant={room.enabled ? "secondary" : "outline"}>
                        {room.enabled ? "저장 허용" : "저장 중지"}
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="col-start-2 row-start-2 justify-self-end sm:col-start-4 sm:row-start-1 max-[380px]:row-start-3 max-[380px]:justify-self-start"
                      disabled={updatingRoom !== null || refreshing}
                      onClick={() => void toggleRoom(room)}
                    >
                      {updatingRoom === room.id && <Spinner data-icon="inline-start" />}
                      {room.enabled ? "임시 저장 중지" : "임시 저장 허용"}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty className="min-h-48">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><DoorOpenIcon /></EmptyMedia>
                  <EmptyTitle>등록된 공간이 없어요</EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}
          </section>
        ) : (
          <section aria-labelledby="admin-drafts-title" className={panelClass}>
            <div className={panelHeaderClass}>
              <h2 id="admin-drafts-title" className="type-heading-md">임시 저장 내역</h2>
              <p className="type-body-sm text-muted-foreground tabular-nums">
                {drafts.length === 100 ? "최근 100건" : `검색 결과 ${drafts.length}건`}
              </p>
            </div>
            <form
              key={JSON.stringify(filters)}
              className="grid grid-cols-2 items-end gap-3 border-b px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_11rem_auto]"
              action="/"
              method="get"
              aria-label="임시 저장 내역 검색"
            >
              <input type="hidden" name="view" value="drafts" />
              <Field className="col-span-2 min-w-0 lg:col-span-1">
                <FieldLabel htmlFor="search-q">행사명·사용 목적·공간명</FieldLabel>
                <Input id="search-q" type="search" name="q" defaultValue={filters.q} maxLength={200} placeholder="검색어 입력" />
              </Field>
              <Field className="min-w-0">
                <FieldLabel htmlFor="search-date">사용 날짜</FieldLabel>
                <DatePicker id="search-date" name="date" defaultValue={filters.date} clearable />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit"><SearchIcon data-icon="inline-start" />검색</Button>
                <Button variant="outline" asChild><Link href="/?view=drafts">초기화</Link></Button>
              </div>
            </form>
            <RequestErrorToast message={searchError} id="draft-search-error" />
            {drafts.length > 0 ? (
              <ul className="divide-y">
                {drafts.map((draft) => (
                  <li key={draft.id} className="grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-4 py-3.5 md:grid-cols-[3.25rem_minmax(0,1fr)_6.5rem_auto] md:items-center md:gap-x-4 sm:px-5">
                    <time dateTime={draft.date} className="row-span-3 flex flex-col items-center gap-0.5 rounded-md bg-surface-section py-1.5 tabular-nums md:row-span-1">
                      <span className="type-heading-md">{draft.date.slice(8)}</span>
                      <span className="type-body-xs text-muted-foreground">{draft.date.slice(0, 7).replace("-", ".")}</span>
                    </time>
                    <div className="flex min-w-0 flex-col gap-1">
                      <h3 className="type-heading-sm wrap-anywhere">{draft.eventName || draft.roomName || "임시 저장한 예약"}</h3>
                      <p className="type-body-sm text-muted-foreground">{[draft.eventName && draft.roomName, draft.purpose, `${draft.attendees}명`, draft.displayName].filter(Boolean).join(" · ")}</p>
                    </div>
                    <span className="col-start-2 inline-flex items-center gap-1.5 type-body-sm whitespace-nowrap tabular-nums text-muted-foreground md:col-auto">
                      <Clock3Icon aria-hidden="true" className="size-3.5" />
                      {draft.start}–{draft.end}
                    </span>
                    <Button variant="outline" size="sm" className="col-start-2 justify-self-start md:col-auto md:justify-self-end" onClick={() => void copyDraft(draft)}>
                      <CopyIcon data-icon="inline-start" />
                      내용 복사
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty className="min-h-48">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><FileTextIcon /></EmptyMedia>
                  <EmptyTitle>{hasFilters ? "검색 결과가 없어요" : "임시 저장된 예약이 없어요"}</EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
