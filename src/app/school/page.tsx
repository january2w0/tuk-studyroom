import Link from "next/link";
import { redirect } from "next/navigation";
import { Link2Icon, MapPinIcon } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { InputError, seoulToday } from "@/lib/validation";
import { schoolConnectionStatus } from "@/lib/school/connection";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import SchoolWorkspace from "./school-workspace";
import { bookingRecords, schoolBookingForm, type BookingForm } from "@/lib/school/booking-records";
import { withSchoolAccount } from "@/lib/school/connection";
import { MeetingRoomApi, validatePeriod } from "@/lib/school/meeting-api";
import { lookupSchoolRooms, type RoomLookup } from "@/lib/school/room-lookup";
import { SchoolError } from "@/lib/school/xml";
import { RequestErrorToast } from "@/components/request-error-toast";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

export default async function SchoolPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  if (params.view === "drafts") redirect("/school?view=history");
  const view = params.view === "history" ? "history" : "find";
  const today = seoulToday();
  const status = await schoolConnectionStatus(user.id);
  const [pausedAreas] = view === "find" && status.connected
    ? await db.query<(RowDataPacket & { school_area: string })[]>(
        "SELECT school_area FROM rooms WHERE school_area IS NOT NULL AND enabled=FALSE",
      )
    : [[]];
  const reuseId = typeof params.reuse === "string" && /^[1-9]\d{0,9}$/.test(params.reuse)
    ? Number(params.reuse) : undefined;
  const schoolId = typeof params.reuseSchool === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(params.reuseSchool)
    ? params.reuseSchool : undefined;
  const records = view === "history" ? (await bookingRecords(user.id)).map((record) => ({
    id: record.id, date: record.date, start: record.start, end: record.end,
    roomName: record.roomName, eventName: record.eventName,
    status: record.status, externalId: record.externalId,
  })) : [];
  let reuse: BookingForm | null = view === "find" && reuseId !== undefined
    ? (await bookingRecords(user.id, { id: reuseId }))[0] ?? null : null;
  let requestError: { message: string; requiresLogin: boolean } | undefined;
  function handleError(error: unknown, fallback: string) {
    requestError = {
      message: error instanceof SchoolError || error instanceof InputError ? error.message : fallback,
      requiresLogin: error instanceof SchoolError && ["AUTH_REQUIRED", "SSO_REQUIRED"].includes(error.code),
    };
  }
  if (view === "find" && schoolId && status.connected && reuseId === undefined) {
    reuse = await withSchoolAccount(user.id, async (client) =>
      schoolBookingForm(await new MeetingRoomApi(client).detail(schoolId)),
    3).catch((error: unknown) => {
      handleError(error, "이전 예약을 불러오지 못했습니다.");
      return null;
    });
  }
  let reuseDate: string | undefined;
  let initialRooms: RoomLookup | null = null;
  if (reuse && status.connected && typeof params.date === "string") {
    try {
      const period = validatePeriod({ date: params.date, start: reuse.start, end: reuse.end });
      reuseDate = period.date;
      initialRooms = await lookupSchoolRooms(user.id, period);
    } catch (error) {
      handleError(error, "학교 공간 조회를 완료하지 못했습니다.");
    }
  }
  const reuseSearch = reuseId !== undefined ? `reuse=${reuseId}` : schoolId ? `reuseSchool=${encodeURIComponent(schoolId)}` : "";
  return (
    <div className="school-shell">
      <div className="school-atmosphere" aria-hidden="true" />
      <AppHeader
        name={user.display_name}
        role={user.role}
        active={view === "find" ? "school" : view}
        connection={status}
      />
      <main className="page-container flex max-w-6xl flex-col gap-6 py-6 sm:gap-7 sm:pt-7 sm:pb-9">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
            <div className="flex shrink-0 flex-col gap-2">
              <h1 className="shrink-0 type-display-md">
                {view === "find" ? "공간 예약" : "내 예약"}
              </h1>
            </div>
            <p className="flex items-center gap-2 type-body-sm text-muted-foreground sm:border-l sm:border-boundary-strong sm:py-1 sm:pl-6">
              {view === "find" ? (
                <>
                  <MapPinIcon
                    className="size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span>한국공학대학교</span>
                </>
              ) : (
                "임시 저장한 일정과 학교 신청 상태를 확인하세요."
              )}
            </p>
          </div>
        </div>
        <RequestErrorToast
          message={requestError?.message ?? (view === "find" && (reuseId !== undefined || schoolId) && !reuse
            ? "이전 예약을 불러오지 못했습니다." : undefined)}
          requiresLogin={requestError?.requiresLogin}
        />
        {status.connected || view === "history" ? (
          <SchoolWorkspace
            key={`${user.id}:${status.connected}:${reuseSearch}:${reuseDate ?? ""}`}
            today={today}
            view={view}
            records={records}
            reuse={reuse}
            reuseDate={reuseDate}
            reuseSearch={reuseSearch}
            initialRooms={initialRooms}
            schoolConnected={status.connected}
            pausedAreas={pausedAreas.map((room) => room.school_area)}
          />
        ) : (
          <Card>
            <CardContent>
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Link2Icon />
                  </EmptyMedia>
                  <EmptyTitle>학교 계정을 연결해주세요</EmptyTitle>
                  <EmptyDescription>
                    학교 계정으로 로그인하면 이용 가능한 공간과 본인의 예약 내역을 조회할
                    수 있습니다.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button asChild>
                    <Link href="/login?school=1">학교 계정 로그인</Link>
                  </Button>
                </EmptyContent>
              </Empty>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
