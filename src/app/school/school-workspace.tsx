"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  DoorOpenIcon,
  SearchIcon,
  InfoIcon,
  UsersIcon,
  Clock3Icon,
  RefreshCwIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { Period } from "@/lib/school/meeting-api";
import type { BookingForm, BookingRecord } from "@/lib/school/booking-records";
import type { AttendanceEntry } from "@/lib/school/attendance";
import type { RoomLookup } from "@/lib/school/room-lookup";
import { roomAreas, type RoomArea } from "@/lib/school/rooms";
import {
  DatePicker,
  FormSelect,
  timeOptions,
} from "@/components/form-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { schoolRequestToastId as requestToastId, showRequestError } from "@/components/request-error-toast";
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
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Room = RoomLookup["rooms"][number];
const attendanceFields = [
  { name: "department", label: "학과" },
  { name: "studentId", label: "학번" },
  { name: "name", label: "이름" },
] as const;
const emptyAttendanceRow: AttendanceEntry = { department: "", studentId: "", name: "" };

function BookingParticipants({
  min, max, defaultCount, phone, savedAttendance, requiresAttendance, disabled,
}: {
  min: number;
  max: number;
  defaultCount: number;
  phone?: string;
  savedAttendance?: AttendanceEntry[];
  requiresAttendance: boolean;
  disabled: boolean;
}) {
  const [manualCount, setManualCount] = useState(String(defaultCount));
  const [rows, setRows] = useState(() => Array.from({
    length: Math.max(savedAttendance?.length ?? 0, Math.min(3, max)),
  }, (_, id) => ({ id, ...(savedAttendance?.[id] ?? emptyAttendanceRow) })));
  const nextRowId = useRef(rows.length);
  const addRowButton = useRef<HTMLButtonElement>(null);
  const [openRowMenu, setOpenRowMenu] = useState<number | null>(null);
  // The shared school form offers the template even when an attachment is optional.
  const [includeAttendance, setIncludeAttendance] = useState(savedAttendance !== undefined);
  const showAttendance = requiresAttendance || includeAttendance;
  const rosterCount = rows.filter((row) => attendanceFields.every(({ name }) => row[name].trim())).length;
  const canInsertRow = rows.length < max;
  function insertRow(index: number) {
    const row = { id: nextRowId.current++, ...emptyAttendanceRow };
    setRows((current) => current.length < max ? [...current.slice(0, index), row, ...current.slice(index)] : current);
  }

  function removeRow(index: number) {
    const removed = rows[index];
    const neighbor = rows[index + 1] ?? rows[index - 1];
    setOpenRowMenu(null);
    setRows((current) => current.filter((row) => row.id !== removed.id));
    requestAnimationFrame(() => {
      const target = neighbor ? document.getElementById(`event-attendance-row-${neighbor.id}`) : addRowButton.current;
      target?.focus({ preventScroll: true });
    });
  }
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-disabled={disabled}>
          <FieldLabel htmlFor="event-attendees">
            참여 인원 {showAttendance && <span className="text-muted-foreground">(명단 기준)</span>}
          </FieldLabel>
          <Input
            id="event-attendees"
            name="attendees"
            type="number"
            min={min}
            max={max}
            value={showAttendance ? rosterCount : manualCount}
            readOnly={showAttendance}
            onChange={(event) => setManualCount(event.currentTarget.value)}
            required={!showAttendance}
          />
        </Field>
        <Field data-disabled={disabled}>
          <FieldLabel htmlFor="event-phone">신청자 휴대폰</FieldLabel>
          <Input
            id="event-phone"
            name="phone"
            defaultValue={phone}
            type="tel"
            autoComplete="tel"
            required
            maxLength={14}
            placeholder="010-0000-0000"
          />
        </Field>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        {!requiresAttendance && (
          <Field orientation="horizontal" data-disabled={disabled}>
            <Checkbox
              id="event-include-attendance"
              aria-controls="event-attendance"
              checked={includeAttendance}
              onCheckedChange={(checked) => setIncludeAttendance(checked === true)}
            />
            <FieldLabel htmlFor="event-include-attendance">
              참석자 명단 추가 <span className="text-muted-foreground">(선택)</span>
            </FieldLabel>
          </Field>
        )}
        <FieldSet id="event-attendance" className={showAttendance ? "min-w-0" : "hidden"} disabled={!showAttendance}>
          <legend className={requiresAttendance ? "mb-2 type-label-md" : "sr-only"}>참석자 명단</legend>
          <input type="hidden" name="attendanceEnabled" value="on" />
          <div className="overflow-hidden rounded-md border border-boundary-default bg-surface-panel">
            <table className="w-full table-fixed border-collapse text-left">
              <colgroup>
                <col className="w-9 sm:w-10" />
                <col span={attendanceFields.length} />
              </colgroup>
              <thead className="border-b border-boundary-default bg-surface-section text-muted-foreground">
                <tr>
                  <th scope="col"><span className="sr-only">순번</span></th>
                  {attendanceFields.map(({ name, label }) => (
                    <th key={name} scope="col" className="px-2 py-2 type-label-sm sm:px-3">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-boundary-default">
                {rows.map((row, index) => (
                  <tr key={row.id}>
                    <th scope="row" className="bg-surface-section p-0 text-muted-foreground">
                      <DropdownMenu
                        modal={false}
                        open={openRowMenu === row.id}
                        onOpenChange={(open) =>
                          setOpenRowMenu((current) => open ? row.id : current === row.id ? null : current)
                        }
                      >
                        <DropdownMenuTrigger asChild>
                          <Button
                            id={`event-attendance-row-${row.id}`}
                            type="button"
                            variant="ghost"
                            disabled={disabled}
                            aria-label={`참석자 ${index + 1}행 메뉴`}
                            className="h-9 w-full gap-0.5 rounded-none px-0 type-body-xs tabular-nums has-[>svg]:px-0 focus-visible:ring-inset data-[state=open]:bg-accent"
                            onContextMenu={(event) => {
                              event.preventDefault();
                              setOpenRowMenu(row.id);
                            }}
                          >
                            {index + 1}
                            <ChevronDownIcon className="size-2.5 opacity-70" aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem disabled={!canInsertRow} onSelect={() => insertRow(index)}>
                            <ArrowUpIcon />
                            위에 행 삽입
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={!canInsertRow} onSelect={() => insertRow(index + 1)}>
                            <ArrowDownIcon />
                            아래에 행 삽입
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => removeRow(index)}>
                            <Trash2Icon />
                            행 삭제
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </th>
                    {attendanceFields.map(({ name, label }) => (
                      <td key={name} className="border-l border-boundary-default p-0">
                        <Input
                          name={`attendance-${name}`}
                          aria-label={`참석자 ${index + 1} ${label}`}
                          inputMode={name === "studentId" ? "numeric" : undefined}
                          pattern={name === "studentId" && row.studentId.trim() ? "[0-9]+" : undefined}
                          maxLength={name === "studentId" ? 20 : 80}
                          value={row[name]}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setRows((current) => current.map((entry) => entry.id === row.id ? { ...entry, [name]: value } : entry));
                          }}
                          autoComplete="off"
                          className="rounded-none border-0 bg-transparent px-2 shadow-none ring-0 ring-ring/50 ring-inset outline-1 -outline-offset-1 outline-solid outline-transparent transition-[box-shadow,outline-color] focus-visible:outline-ring motion-reduce:transition-none sm:px-3"
                          required={attendanceFields.some(({ name }) => !!row[name].trim())}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-boundary-default bg-surface-section">
                <tr>
                  <td colSpan={attendanceFields.length + 1} className="p-0">
                    <Button
                      ref={addRowButton}
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="w-full justify-start rounded-none focus-visible:ring-inset"
                      disabled={!canInsertRow}
                      onClick={() => insertRow(rows.length)}
                    >
                      <PlusIcon data-icon="inline-start" />
                      행 추가
                    </Button>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </FieldSet>
      </div>
    </div>
  );
}

function splitSchoolNotice(text: string) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    /^(?:[◇◆□■*]+\s*)?개인정보\s*수집\s*[·ㆍ・∙.\/-]?\s*이용\s*(?:동의|안내)/.test(line.trim()),
  );
  if (start === -1) return { guidance: text.trim(), privacy: "" };

  const nextSection = lines.findIndex((line, index) =>
    index > start && /^[◇◆□■]/.test(line.trimStart()),
  );
  const end = nextSection === -1 ? lines.length : nextSection;
  return {
    guidance: [...lines.slice(0, start), ...lines.slice(end)].join("\n").trim(),
    privacy: lines.slice(start, end).join("\n").trim(),
  };
}

function findPreviousRoom(rooms: Room[], reuse: BookingForm | null, area: RoomArea) {
  if (!reuse || area !== reuse.area) return undefined;
  return rooms.find((room) => room.area === area && room.code === reuse.roomCode);
}
type Booking = {
  id: string;
  name: string;
  location: string;
  date: string;
  start: string;
  end: string;
  title: string;
  state: string;
  stateName: string;
  cancellable: boolean;
};
type RequestState = { id: number; external_id: string | null; status: string };
type History = { bookings: Booking[]; requests: RequestState[] };
const historyRowLayout =
  "grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:grid-cols-[3.25rem_minmax(0,1fr)_6.25rem_7rem_6.5rem] sm:gap-x-4 sm:px-5";

class SchoolRequestError extends Error {
  constructor(
    message: string,
    readonly requiresLogin: boolean,
  ) {
    super(message);
  }
}

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new SchoolRequestError(
      data?.error || "학교 요청을 완료하지 못했습니다.",
      response.status === 401 || data?.code === "SSO_REQUIRED",
    );
  if (data === null) throw new Error("학교 응답을 확인하지 못했습니다.");
  return data;
}

const labels: Record<string, string> = {
  draft: "임시 저장 · 학교 미신청",
  confirmed: "학교 접수 확인",
  submitted: "학교 신청 확인 · 승인 대기",
  saved: "학교 임시저장 · 아직 신청되지 않음",
  cancelled: "학교 신청 취소 확인",
  unknown: "학교 결과 재확인 필요",
  sending: "학교 처리 결과 확인 중",
  failed: "요청 처리 실패",
};
function notifyBookingResult(status: string, id?: string) {
  const message = `${labels[status] || labels.unknown}${id ? ` · 학교 신청번호 ${id}` : ""}`;
  if (["confirmed", "submitted", "cancelled"].includes(status)) {
    toast.success(message);
  } else if (status === "failed") {
    toast.error(message);
  } else {
    toast.info(message);
  }
}
const showTime = (value: string) =>
  /^\d{4}$/.test(value) ? value.slice(0, 2) + ":" + value.slice(2) : value;
const startTimeOptions = timeOptions.slice(0, -1);
const areaOptions = Object.entries(roomAreas).map(([value, { label }]) => ({ value, label }));
const roomSign = (room?: Room) =>
  (room?.number.match(/-(\d+)$/)?.[1] ?? room?.name.match(/미팅룸[-\s]*(\d+)/)?.[1])
    ?.padStart(2, "0") || "—";
const roomTitle = (name: string) =>
  name.replace(/\s*\([^)]*\)$/, "").replace(/(미팅룸|스터디룸|회의실)-?(?=\d)/, "$1 ");
export default function SchoolWorkspace({
  today,
  view,
  records,
  reuse,
  reuseDate,
  reuseSearch,
  initialRooms,
  schoolConnected,
  pausedAreas,
}: {
  today: string;
  view: "find" | "history";
  records: Pick<BookingRecord, "id" | "date" | "start" | "end" | "roomName" | "eventName" | "status" | "externalId">[];
  reuse: BookingForm | null;
  reuseDate?: string;
  reuseSearch: string;
  initialRooms: RoomLookup | null;
  schoolConnected: boolean;
  pausedAreas: string[];
}) {
  const router = useRouter();
  const [dateLookupPending, startDateLookup] = useTransition();
  const initialMatch = reuse && initialRooms
    ? findPreviousRoom(initialRooms.rooms, reuse, reuse.area) : undefined;
  const initialRoomCode = initialMatch && !initialMatch.restriction ? initialMatch.code : "";
  const [period, setPeriod] = useState<Period>({
    date: reuseDate ?? today,
    start: reuse?.start ?? "09:30",
    end: reuse?.end ?? "10:30",
  });
  const [prefill, setPrefill] = useState<BookingForm | null>(() =>
    reuse && initialRoomCode ? { ...reuse, roomCode: initialRoomCode } : reuse);
  const [formVersion, setFormVersion] = useState(0);
  const [loaded, setLoaded] = useState<RoomLookup | null>(initialRooms);
  const [roomCode, setRoomCode] = useState(initialRoomCode),
    [busy, setBusy] = useState(false),
    [activity, setActivity] = useState("");
  const [bookingError, setBookingError] =
    useState<SchoolRequestError | null>(null);
  const [historyDate, setHistoryDate] = useState("");
  const [appliedDate, setAppliedDate] = useState("");
  const [history, setHistory] = useState<History | null>(null);
  const [historySynced, setHistorySynced] = useState(false);
  const initialSync = view === "history" && schoolConnected && !historySynced;
  const initialHistoryRequest = useRef<Promise<History> | null>(null);
  useEffect(() => {
    if (!initialSync) return;
    let active = true;
    initialHistoryRequest.current ??= call("/api/school/bookings?recent=1");
    void initialHistoryRequest.current
      .then((data: History) => { if (active) setHistory(data); })
      .catch((error: unknown) => {
        if (active) showRequestError(
          "학교 내역을 불러오지 못했습니다.", requestToastId,
          error instanceof SchoolRequestError && error.requiresLogin,
        );
      })
      .finally(() => { if (active) setHistorySynced(true); });
    return () => { active = false; };
  }, [initialSync]);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    action: string;
    run: () => Promise<void>;
  } | null>(null);
  const requestRef = useRef<{ payload: string; key: string } | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  useEffect(() => {
    if (!initialRoomCode) return;
    // Open after the page mounts so the sheet uses its normal entrance animation.
    const frame = requestAnimationFrame(() => setBookingOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [initialRoomCode]);
  const roomButtonRef = useRef<HTMLButtonElement | null>(null);
  const selectedDate = new Date(period.date + "T12:00:00");
  const [area, setArea] = useState<RoomArea>(reuse?.area ?? "dorm");
  const [capacityFilter, setCapacityFilter] = useState("all");
  const areaRooms = (loaded?.rooms ?? []).filter((room) => room.area === area);
  const capacities = [
    ...new Set(
      areaRooms
        .map((room) => Number(room.capacity))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  ].sort((a, b) => a - b);
  const visibleRooms = areaRooms.filter(
    (room) =>
      capacityFilter === "all" ||
      Number(room.capacity) === Number(capacityFilter),
  );
  const selected = areaRooms.find((room) => room.code === roomCode);
  const notices = [selected?.notice ?? "", selected?.terms ?? ""].map(splitSchoolNotice);
  const facilityGuidance = notices.map(({ guidance }) => guidance).filter(Boolean);
  const privacyNotice = [...new Set(notices.map(({ privacy }) => privacy).filter(Boolean))].join("\n\n");
  const guidanceText = facilityGuidance.join("\n");
  const hasDormGuidance = /운영\s*시간/.test(guidanceText) &&
    /TIP\s*223/.test(guidanceText) && /음[식실]물\s*섭취/.test(guidanceText);
  const previousRoom = loaded && findPreviousRoom(loaded.rooms, reuse, area);
  const previous = prefill?.roomCode === roomCode ? prefill : null;
  const minAttendees = roomAreas[area].minAttendees;
  const maxAttendees = Math.min(Number(selected?.capacity) || 99, 99);
  const defaultAttendees = Math.min(Math.max(previous?.attendees || 3, minAttendees), maxAttendees);
  const minimumLabel = minAttendees > 1 ? `최소 ${minAttendees}명 · ` : "";
  const endTimeOptions = timeOptions.filter(({ value }) => value > period.start);
  function changePeriod(next: Period) {
    setCapacityFilter("all");
    setBookingOpen(false);
    setPeriod(next);
    setLoaded(null);
    setRoomCode("");
  }
  async function run(action: () => Promise<void>, kind = "submit") {
    setBusy(true);
    setActivity(kind);
    if (kind === "rooms") setCapacityFilter("all");
    toast.dismiss(requestToastId);
    setBookingError(null);
    try {
      await action();
    } catch (error) {
      const feedback =
        error instanceof SchoolRequestError
          ? error
          : new SchoolRequestError("학교 응답을 확인하지 못했습니다.", false);
      if (bookingOpen) setBookingError(feedback);
      showRequestError(feedback.message, requestToastId, feedback.requiresLogin && !bookingOpen);
    } finally {
      setBusy(false);
      setActivity("");
    }
  }
  async function refreshHistory(date: string) {
    if (schoolConnected) {
      setHistory(await call(`/api/school/bookings?${date ? `date=${encodeURIComponent(date)}` : "recent=1"}`));
      router.refresh();
    }
    setAppliedDate(date);
  }
  const schoolBookings = history?.bookings ?? [];
  const schoolById = new Map(schoolBookings.map((booking) => [booking.id, booking]));
  const recordedIds = new Set(records.map((record) => record.externalId));
  const historyItems = [
    ...records.map((record) => ({
      ...record,
      key: `app-${record.id}`,
      href: `/school?reuse=${record.id}`,
      school: record.externalId ? schoolById.get(record.externalId) : undefined,
    })),
    ...schoolBookings.filter((booking) => !recordedIds.has(booking.id)).map((booking) => ({
      key: `school-${booking.id}`,
      date: booking.date.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"),
      start: booking.start,
      end: booking.end,
      roomName: booking.location || booking.name,
      eventName: booking.title,
      status: "unknown",
      externalId: booking.id,
      href: `/school?reuseSchool=${encodeURIComponent(booking.id)}`,
      school: booking,
    })),
  ].filter((item) => !appliedDate || item.date === appliedDate)
    .sort((a, b) => b.date.localeCompare(a.date) || showTime(b.start).localeCompare(showTime(a.start)));

  function confirmCancellation(booking: Booking) {
    setConfirmation({
      title: "학교 신청을 취소할까요?",
      description: `${booking.name} · ${booking.title}`,
      action: "신청 취소",
      run: async () => {
        const result = await call("/api/school/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operation: "cancel", externalId: booking.id, requestKey: crypto.randomUUID() }),
        });
        notifyBookingResult(result.status);
        await refreshHistory(appliedDate);
      },
    });
  }
  return (
    <>
      {view === "find" ? (
        <div className="grid min-w-0 items-start gap-5 md:grid-cols-[264px_minmax(0,1fr)] md:gap-8 lg:gap-12">
          <aside
            className="min-w-0 overflow-hidden rounded-lg border bg-card"
            aria-label="이용 장소와 일정 선택"
          >
            <div className="flex items-center gap-4 bg-primary px-4 py-3 text-primary-foreground md:block md:p-6">
              <p
                className="type-room-sign md:type-building-sign"
                aria-label={roomAreas[area].number + "호"}
              >
                {roomAreas[area].number}<span className="ml-1 type-body-sm md:hidden">호</span>
              </p>
              <div className="flex flex-col gap-1 md:mt-4">
                <p className="type-label-md">{roomAreas[area].label}</p>
              </div>
            </div>
            <form
              className="p-4 md:p-6"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const data = await call(
                    "/api/school/rooms?" + new URLSearchParams(period),
                  );
                  setLoaded(data);
                  const match = findPreviousRoom(data.rooms, reuse, area);
                  setRoomCode(match && !match.restriction ? match.code : "");
                  if (reuse && match && !match.restriction) {
                    setPrefill({ ...reuse, roomCode: match.code });
                    setBookingOpen(true);
                  }
                }, "rooms");
              }}
            >
              <FieldSet disabled={busy || dateLookupPending}>
                <FieldGroup className="grid grid-cols-2 items-end gap-3 md:gap-4">
                  {reuse && area === reuse.area && !reuseDate && !loaded && !dateLookupPending && (
                    <p className="col-span-2 type-body-sm text-muted-foreground">
                      {reuse.roomName}의 예약을 다시 신청할 날짜를 선택해주세요.
                    </p>
                  )}
                  <Field className="col-span-2">
                    <FieldLabel htmlFor="school-area">이용 장소</FieldLabel>
                    <FormSelect
                      id="school-area"
                      value={area}
                      options={areaOptions}
                      disabled={busy}
                      onValueChange={(value) => {
                        setArea(value as RoomArea);
                        setCapacityFilter("all");
                        setRoomCode("");
                        setBookingOpen(false);
                      }}
                    />
                    {area === "engineering" && (
                      <FieldDescription>AI융합대학 재학생만 신청 가능</FieldDescription>
                    )}
                  </Field>
                  <Field className="col-span-2">
                    <FieldLabel htmlFor="school-date">이용 날짜</FieldLabel>
                    <DatePicker
                      id="school-date"
                      min={today}
                      value={period.date}
                      disabled={busy}
                      onValueChange={(date) => {
                        if (date === period.date) return;
                        if (reuse && area === reuse.area && period.start === reuse.start && period.end === reuse.end) {
                          startDateLookup(() => router.replace(`/school?${reuseSearch}&date=${date}`));
                        } else {
                          changePeriod({ ...period, date });
                        }
                      }}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="school-start">시작 시간</FieldLabel>
                    <FormSelect
                      id="school-start"
                      value={period.start}
                      options={startTimeOptions}
                      disabled={busy}
                      onValueChange={(start) => {
                        const end = period.end > start
                          ? period.end
                          : timeOptions.find(({ value }) => value > start)?.value;
                        if (end) changePeriod({ ...period, start, end });
                      }}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="school-end">종료 시간</FieldLabel>
                    <FormSelect
                      id="school-end"
                      value={period.end}
                      options={endTimeOptions}
                      disabled={busy}
                      onValueChange={(end) => changePeriod({ ...period, end })}
                    />
                  </Field>
                  <Button type="submit" disabled={busy || dateLookupPending} className="col-span-2">
                    {activity === "rooms" || dateLookupPending ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <SearchIcon data-icon="inline-start" />
                    )}
                    {activity === "rooms" || dateLookupPending ? "공간 조회 중" : "공간 조회"}
                  </Button>
                </FieldGroup>
              </FieldSet>
            </form>
          </aside>
          <section
            className="min-w-0 overflow-hidden rounded-lg border bg-card"
            aria-labelledby="rooms-title"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:gap-4 sm:px-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:flex-col sm:items-start">
                <h2 id="rooms-title" className="type-heading-md">
                  공간 선택
                </h2>
                <p role="status" className="type-body-sm text-muted-foreground">
                  {loaded
                    ? capacityFilter === "all"
                      ? "학교에서 조회한 공간 " + areaRooms.length + "개"
                      : visibleRooms.length +
                        "개 표시 · 전체 " +
                        areaRooms.length +
                        "개"
                    : "먼저 일정을 조회하세요"}
                </p>
              </div>
              {loaded && (
                <dl className="flex flex-col gap-1 sm:items-end">
                  <dt className="sr-only type-body-xs text-muted-foreground sm:not-sr-only">
                    조회한 일정
                  </dt>
                  <dd className="flex flex-wrap items-center gap-x-3 gap-y-1 type-label-md">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <CalendarDaysIcon className="size-3.5 text-muted-foreground" />
                      {format(selectedDate, "M월 d일 (E)", { locale: ko })}
                    </span>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums">
                      <Clock3Icon className="size-3.5 text-muted-foreground" />
                      {period.start}–{period.end}
                    </span>
                  </dd>
                </dl>
              )}
            </div>
            {loaded && reuse && area === reuse.area && (!previousRoom || previousRoom.restriction) && (
              <p role="status" className="border-b px-4 py-3 type-body-sm text-muted-foreground sm:px-5">
                {previousRoom?.restriction || `선택한 시간에는 ${reuse.roomName} 예약이 조회되지 않았습니다. 다른 날짜를 선택해보세요.`}
              </p>
            )}
            {capacities.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-surface-section px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="type-label-sm text-muted-foreground">
                    정원
                  </span>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    value={capacityFilter}
                    onValueChange={(value) => {
                      if (value) setCapacityFilter(value);
                    }}
                    disabled={busy}
                    aria-label="공간 정원 필터"
                  >
                    <ToggleGroupItem value="all">전체</ToggleGroupItem>
                    {capacities.map((capacity) => (
                      <ToggleGroupItem key={capacity} value={String(capacity)}>
                        {capacity}인실
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
              </div>
            )}
            <div
              aria-live="polite"
              aria-busy={activity === "rooms"}
              className="md:min-h-80"
            >
              {activity === "rooms" ? (
                <div className="flex flex-col" aria-label="공간 조회 중">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="flex items-center gap-5 border-b px-5 py-4 last:border-b-0"
                    >
                      <Skeleton className="size-10" />
                      <div className="flex flex-1 flex-col gap-2">
                        <Skeleton className="h-5 w-28" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-8 w-16" />
                    </div>
                  ))}
                </div>
              ) : visibleRooms.length ? (
                <ul>
                  {visibleRooms.map((room) => (
                    <li key={room.code} className="border-b last:border-b-0">
                      <Button
                        variant="ghost"
                        className="group/room grid h-auto w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-none px-4 py-3 text-left whitespace-normal hover:bg-surface-section hover:text-foreground focus-visible:ring-inset lg:grid-cols-[3rem_minmax(0,1fr)_minmax(5rem,auto)_auto] lg:gap-5 lg:px-5"
                        disabled={busy || Boolean(room.restriction)}
                        aria-label={room.name + (room.restriction ? " 신청 제한" : " 선택")}
                        aria-describedby={"room-meta-" + room.code}
                        onClick={(event) => {
                          roomButtonRef.current = event.currentTarget;
                          setBookingError(null);
                          setPrefill(reuse && previousRoom?.code === room.code ? { ...reuse, roomCode: room.code } : null);
                          setRoomCode(room.code);
                          setBookingOpen(true);
                        }}
                      >
                        <span
                          aria-hidden="true"
                          className="type-room-sign text-primary"
                        >
                          {roomSign(room)}
                        </span>
                        <span className="flex min-w-0 flex-col gap-1">
                          <span className="type-heading-sm">
                            {roomTitle(room.name)}
                          </span>
                          <span
                            id={"room-meta-" + room.code}
                            className="flex flex-wrap gap-x-2 type-body-sm text-muted-foreground"
                          >
                            <span className="whitespace-nowrap">
                              {room.number || room.location}
                            </span>
                            {room.restriction && <span>{room.restriction}</span>}
                            <span className="whitespace-nowrap lg:sr-only">
                              {minimumLabel}
                              {room.capacity
                                ? "정원 " + room.capacity + "명"
                                : "정원 미제공"}
                            </span>
                          </span>
                        </span>
                        <span aria-hidden="true" className="hidden items-center justify-end gap-1.5 type-label-md whitespace-nowrap tabular-nums text-muted-foreground lg:inline-flex">
                          <UsersIcon />
                          {minimumLabel && <span>{minimumLabel}</span>}
                          {room.capacity
                            ? `${minimumLabel ? "정원 " : ""}${room.capacity}명`
                            : "—"}
                        </span>
                        <span className="inline-flex h-8 items-center justify-center gap-2 px-1 type-label-sm whitespace-nowrap text-primary">
                          {room.restriction ? "신청 제한" : (
                            <ArrowRightIcon aria-hidden="true" className="transition-transform group-hover/room:translate-x-0.5 group-focus-visible/room:translate-x-0.5" />
                          )}
                        </span>
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty className="min-h-44 rounded-none px-4 py-8 md:min-h-80 md:px-5 md:py-12">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      {loaded ? <DoorOpenIcon /> : <CalendarDaysIcon />}
                    </EmptyMedia>
                    <EmptyTitle>
                      {loaded
                        ? "조회되는 공간이 없습니다"
                        : "이용할 시간을 먼저 정해주세요"}
                    </EmptyTitle>
                    <EmptyDescription>
                      {loaded
                        ? "다른 날짜나 시간으로 다시 조회해주세요."
                        : "날짜와 시간을 조회하면 공간을 비교하고 선택할 수 있습니다."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </div>
            <div className="flex items-start gap-2 border-t bg-surface-section px-4 py-3 type-body-sm text-muted-foreground sm:px-5">
              <InfoIcon className="size-4 shrink-0" />
              <p>
                신청할 때 예약 가능 여부를 다시 확인합니다. 신청 후 처리 상태는{" "}
                <Link
                  className="focus-control rounded-sm underline underline-offset-4"
                  href="/school?view=history"
                >
                  내 예약
                </Link>
                에서 확인하세요.
              </p>
            </div>
          </section>
        </div>
      ) : (
        <section
          className="flex min-h-80 flex-col rounded-lg border bg-card"
          aria-label="예약 내역"
        >
          <div className="flex flex-1 flex-col">
            <form
              className="flex flex-wrap items-center gap-3 rounded-t-lg border-b bg-surface-section px-4 py-4 sm:px-5"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => refreshHistory(historyDate), "history");
              }}
            >
              <Field className="w-full sm:w-56">
                <FieldLabel htmlFor="history-date" className="sr-only">조회 날짜</FieldLabel>
                <DatePicker
                  id="history-date"
                  placeholder="조회 날짜 선택"
                  value={historyDate}
                  onValueChange={setHistoryDate}
                  disabled={busy || initialSync}
                  clearable
                />
              </Field>
              <Button type="submit" variant="outline" disabled={busy || initialSync}>
                {initialSync || activity === "history" ? (
                  <Spinner data-icon="inline-start" />
                ) : historyDate ? (
                  <SearchIcon data-icon="inline-start" />
                ) : (
                  <RefreshCwIcon data-icon="inline-start" />
                )}
                {historyDate ? "조회" : "최근 내역 새로고침"}
              </Button>
              <p role="status" className="ml-auto type-body-sm text-muted-foreground tabular-nums">
                {initialSync || activity === "history" ? "학교 내역 조회 중" : `예약 ${historyItems.length}건`}
              </p>
            </form>
            {historyItems.length > 0 ? (
              <ul className="divide-y">
                {historyItems.map((item) => {
                  const [, year, month, day] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(item.date) ?? [];
                  const title = item.eventName || item.roomName || "임시 저장한 예약";
                  const time = `${showTime(item.start)}–${showTime(item.end)}`;
                  const schoolState = item.school?.state;
                  const label = item.status === "cancelled" ? labels.cancelled
                    : item.school?.stateName || (schoolState && {
                      "020": "승인 대기", "070": "접수", "010": "학교 임시저장",
                    }[schoolState]) || labels[item.status] || labels.unknown;
                  let tone: string | undefined;
                  if (item.status !== "cancelled") {
                    if (item.school?.stateName === "반려" || item.status === "failed") tone = "bg-destructive/10 text-destructive";
                    else if (schoolState === "070" || (!schoolState && item.status === "confirmed")) tone = "bg-signal-success/10 text-signal-success";
                    else if (schoolState === "020" || (!schoolState && item.status === "submitted")) tone = "bg-signal-warning/10 text-signal-warning";
                  }
                  return (
                    <li key={item.key} className={`${historyRowLayout} transition-colors hover:bg-surface-section`}>
                        <time dateTime={item.date} className="row-span-2 flex flex-col items-center gap-0.5 rounded-md bg-surface-section py-1.5 tabular-nums sm:row-span-1">
                          {day ? (
                            <><span className="type-heading-md">{day}</span><span className="type-body-xs text-muted-foreground">{year}.{month}</span></>
                          ) : <span className="type-body-xs">{item.date || "—"}</span>}
                        </time>
                        <span className="flex min-w-0 flex-col gap-1">
                          <span className="type-heading-sm wrap-break-word">{title}</span>
                          {item.eventName && item.roomName && item.roomName !== title && (
                            <span className="type-body-sm text-muted-foreground wrap-break-word">{item.roomName}</span>
                          )}
                        </span>
                        <span className="col-start-2 row-start-2 flex flex-wrap items-center gap-x-2 gap-y-1 sm:contents">
                          <span className="inline-flex items-center gap-1.5 type-body-sm whitespace-nowrap text-muted-foreground tabular-nums sm:col-start-3 sm:row-start-1">
                            <Clock3Icon aria-hidden="true" className="size-3.5" />{time}
                          </span>
                          <Badge variant="secondary" className={`max-w-full whitespace-normal sm:col-start-4 sm:row-start-1 sm:ml-2 sm:max-w-[calc(100%_-_0.5rem)] ${tone ?? ""}`}>{label}</Badge>
                        </span>
                        <div className="col-start-2 flex flex-wrap gap-2 sm:col-start-5 sm:row-start-1 sm:flex-col sm:items-end">
                          {item.href && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button size="sm" variant="outline" disabled={busy || initialSync || dateLookupPending}>
                                  {item.status === "draft" ? "이어서 신청" : "다시 신청"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent align="end" collisionPadding={12} className="max-h-[var(--radix-popover-content-available-height)] w-auto overflow-y-auto p-0" aria-label="재신청 날짜 선택">
                                <div className="border-b px-4 py-3">
                                  <p className="type-label-md">이용 날짜 선택</p>
                                  <p className="type-body-sm text-muted-foreground">
                                    {item.roomName} · {showTime(item.start)}–{showTime(item.end)}
                                  </p>
                                </div>
                                <Calendar
                                  mode="single"
                                  locale={ko}
                                  defaultMonth={new Date(`${today}T12:00:00`)}
                                  disabled={dateLookupPending || { before: new Date(`${today}T00:00:00`) }}
                                  onSelect={(date) => {
                                    if (!date || dateLookupPending) return;
                                    startDateLookup(() => router.push(`${item.href}&date=${format(date, "yyyy-MM-dd")}`));
                                  }}
                                />
                                {dateLookupPending && <p role="status" className="px-4 pb-3 type-body-sm">공간 조회 중</p>}
                              </PopoverContent>
                            </Popover>
                          )}
                          {item.school?.cancellable && item.status !== "cancelled" && (
                            <Button size="sm" variant="outline" disabled={busy}
                              onClick={() => confirmCancellation(item.school!)}>
                              학교 신청 취소
                            </Button>
                          )}
                        </div>
                    </li>
                  );
                })}
              </ul>
            ) : initialSync || activity === "history" ? (
              <ul aria-hidden="true" className="divide-y">
                {[1, 2, 3, 4].map((row) => (
                  <li key={row} className={historyRowLayout}>
                    <div className="row-span-2 flex h-[3.4rem] flex-col items-center justify-center gap-1.5 rounded-md bg-surface-section sm:row-span-1">
                      <Skeleton className="h-4 w-6 motion-reduce:animate-none" />
                      <Skeleton className="h-2.5 w-8 motion-reduce:animate-none" />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <Skeleton className="h-3.5 w-32 max-w-full motion-reduce:animate-none" />
                      <Skeleton className="h-3 w-24 max-w-full motion-reduce:animate-none" />
                    </div>
                    <div className="col-start-2 row-start-2 flex flex-wrap items-center gap-x-2 gap-y-1 sm:contents">
                      <Skeleton className="h-3 w-20 motion-reduce:animate-none sm:col-start-3 sm:row-start-1" />
                      <Skeleton className="h-5 w-12 rounded-full motion-reduce:animate-none sm:col-start-4 sm:row-start-1 sm:ml-2" />
                    </div>
                    <Skeleton className="col-start-2 h-8 w-[4.75rem] motion-reduce:animate-none sm:col-start-5 sm:row-start-1 sm:justify-self-end" />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty className="py-6">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><CalendarDaysIcon /></EmptyMedia>
                  <EmptyTitle>{appliedDate ? "해당 날짜의 예약 내역이 없어요" : "표시할 예약 내역이 없어요"}</EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}
            {history?.requests
              .filter((r) => ["unknown", "sending", "saved"].includes(r.status))
              .map((r) => (
                <p key={r.id} className="border-t px-4 py-3 type-body-sm text-muted-foreground sm:px-5">
                    {labels[r.status]} · 요청 {r.id}
                    {r.external_id ? ` · 학교 신청번호 ${r.external_id}` : ""}.
                    학교 내역을 재확인해주세요.
                </p>
              ))}
          </div>
        </section>
      )}
      <Sheet
        open={view === "find" && bookingOpen && !!selected}
        onOpenChange={(open) => {
          if (!busy) setBookingOpen(open);
        }}
      >
        <SheetContent
          className="w-full gap-0 sm:max-w-xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (roomButtonRef.current ?? document.getElementById("school-date"))?.focus();
          }}
        >
          <SheetHeader className="border-b px-4 py-5 pr-14 sm:p-6 sm:pr-14">
            <div className="flex items-center gap-4">
              <span aria-hidden="true" className="type-room-sign text-primary">
                {roomSign(selected)}
              </span>
              <div className="flex min-w-0 flex-col gap-1.5">
                <SheetTitle>
                  {selected && roomTitle(selected.name)}{" "}
                  예약 신청
                </SheetTitle>
                <SheetDescription>
                  {format(selectedDate, "M월 d일 (E)", { locale: ko })} ·{" "}
                  {period.start}–{period.end}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-5 [scrollbar-color:var(--boundary-focus)_var(--background)] sm:p-6">
            {bookingError && (
              <div className="flex flex-col items-start gap-2">
                <p role="alert" className="sr-only">{bookingError.message}</p>
                {bookingError.requiresLogin && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/login?school=1">다시 로그인</Link>
                  </Button>
                )}
              </div>
            )}
            {selected && (
              <>
                <dl className="grid grid-cols-2 gap-4 rounded-md border bg-surface-section p-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <dt className="type-body-sm text-muted-foreground">
                      공간 위치
                    </dt>
                    <dd className="type-label-md">{selected.location}</dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="type-body-sm text-muted-foreground">
                      최대 정원
                    </dt>
                    <dd className="type-label-md">
                      {selected.capacity
                        ? selected.capacity + "명"
                        : "학교 미제공"}
                    </dd>
                  </div>
                </dl>
                <Accordion type="single" collapsible>
                  <AccordionItem value="facility">
                    <AccordionTrigger>
                      시설 유의사항 및 사용 지침
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="flex flex-col gap-3 whitespace-pre-wrap text-muted-foreground">
                        {facilityGuidance.length > 0
                          ? facilityGuidance.map((guidance, index) => <p key={index}>{guidance}</p>)
                          : <p>학교에서 별도 유의사항을 반환하지 않았습니다.</p>}
                        {selected.area === "dorm" && !hasDormGuidance && (
                          <p>
                            운영시간은 학기 중 평일 09:30~17:00, 방학 중 09:30~14:30입니다.
                            사용 전 TIP223호에서 카드 키를 수령하고 음식물 섭취를 삼가주세요.
                          </p>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
                <Button variant="outline" size="sm" className="self-start" disabled={busy}
                  onClick={() => void run(async () => {
                    const { record } = await call(`/api/school/drafts?roomCode=${encodeURIComponent(roomCode)}`);
                    if (!record) {
                      toast.info("이 공간에 저장된 예약 정보가 없습니다.");
                      return;
                    }
                    setPrefill(record);
                    setFormVersion((version) => version + 1);
                    toast.success("이전 예약 정보를 불러왔습니다.");
                  }, "prefill")}
                >
                  최근 예약 정보 불러오기
                </Button>
                <form
                  key={`${period.date}:${period.start}:${period.end}:${roomCode}:${formVersion}`}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!selected) return;
                    const f = new FormData(e.currentTarget),
                      body = {
                        ...period,
                        roomCode,
                        area: selected.area,
                        roomName: selected.location || selected.name,
                        purpose: f.get("purpose"),
                        eventName: f.get("eventName"),
                        attendees: Number(f.get("attendees")),
                        equipment: f.get("equipment"),
                        phone: f.get("phone"),
                        eventCode: f.get("eventCode"),
                        userCode: f.get("userCode"),
                        consent: f.get("consent") === "on",
                      };
                    const savingDraft = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "draft";
                    const studentIds = f.getAll("attendance-studentId");
                    const names = f.getAll("attendance-name");
                    const attendanceRows = f.has("attendanceEnabled")
                      ? f.getAll("attendance-department").map((department, index) => ({
                          department: String(department).trim(),
                          studentId: String(studentIds[index] ?? "").trim(),
                          name: String(names[index] ?? "").trim(),
                        }))
                      : undefined;
                    const attendanceEntries = savingDraft
                      ? attendanceRows
                      : attendanceRows?.filter(({ department, studentId, name }) => department || studentId || name);
                    const submission = { ...body, attendanceEntries };
                    if (savingDraft) {
                      void run(async () => {
                        await call("/api/school/drafts", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(submission),
                        });
                        setBookingOpen(false);
                        toast.success("임시 저장했습니다. 내 예약에서 이어서 신청할 수 있습니다.");
                        router.refresh();
                      }, "draft");
                      return;
                    }
                    if (attendanceEntries) {
                      if (attendanceEntries.length !== body.attendees) {
                        toast.error("작성 중인 행의 학과, 학번, 이름을 모두 입력해주세요.");
                        return;
                      }
                      if (body.attendees < minAttendees) {
                        toast.error(minAttendees === 1 ? "참석자 명단을 입력해주세요." : `이 공간은 ${minAttendees}명부터 신청할 수 있습니다.`);
                        return;
                      }
                      if (body.attendees > maxAttendees) {
                        toast.error(`이 공간의 최대 정원은 ${maxAttendees}명입니다.`);
                        return;
                      }
                    }
                    setConfirmation({
                      title: "학교에 예약을 신청할까요?",
                      description: `${selected.name} · ${period.date} ${period.start}–${period.end}\n${body.eventName} · ${body.attendees}명`,
                      action: "학교에 신청",
                      run: async () => {
                        const payload = JSON.stringify(submission);
                        if (requestRef.current?.payload !== payload)
                          requestRef.current = {
                            payload,
                            key: crypto.randomUUID(),
                          };
                        const result = await call("/api/school/bookings", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ ...submission, requestKey: requestRef.current.key }),
                        });
                        notifyBookingResult(result.status, result.id);
                        setBookingOpen(false);
                        setLoaded(null);
                        setRoomCode("");
                        router.refresh();
                      },
                    });
                  }}
                >
                  <FieldSet disabled={busy || !selected}>
                    <FieldGroup>
                      <Field data-disabled={!selected || busy}>
                        <FieldLabel htmlFor="event-name">행사명</FieldLabel>
                        <Input
                          id="event-name"
                          name="eventName"
                          defaultValue={previous?.eventName}
                          required
                          maxLength={100}
                          placeholder="예: 데이터베이스 프로젝트 회의"
                        />
                      </Field>
                      <Field data-disabled={!selected || busy}>
                        <FieldLabel htmlFor="event-purpose">
                          사용 목적
                        </FieldLabel>
                        <Textarea
                          id="event-purpose"
                          name="purpose"
                          defaultValue={previous?.purpose}
                          required
                          maxLength={200}
                          rows={2}
                          placeholder="어떤 목적으로 이용하시나요?"
                        />
                      </Field>
                      <BookingParticipants
                        min={minAttendees}
                        max={maxAttendees}
                        defaultCount={defaultAttendees}
                        phone={previous?.phone}
                        savedAttendance={previous?.attendanceEntries}
                        requiresAttendance={!!selected?.attendanceFileRequired}
                        disabled={!selected || busy}
                      />
                      <Field data-disabled={!selected || busy}>
                        <FieldLabel htmlFor="event-equipment">
                          필요기자재 <span className="text-muted-foreground">(선택)</span>
                        </FieldLabel>
                        <Textarea
                          id="event-equipment"
                          name="equipment"
                          defaultValue={previous?.equipment}
                          maxLength={200}
                          rows={2}
                          placeholder="필요한 기자재가 있으면 입력해주세요"
                        />
                      </Field>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field data-disabled={!selected || busy}>
                          <FieldLabel htmlFor="event-code">
                            행사 구분
                          </FieldLabel>
                          <FormSelect
                            id="event-code"
                            name="eventCode"
                            defaultValue={previous?.eventCode}
                            required
                            disabled={busy || !selected}
                            options={
                              loaded?.options.events.map((v) => ({
                                value: v.code,
                                label: v.name,
                              })) || []
                            }
                          />
                        </Field>
                        <Field data-disabled={!selected || busy}>
                          <FieldLabel htmlFor="user-code">
                            이용자 구분
                          </FieldLabel>
                          <FormSelect
                            id="user-code"
                            name="userCode"
                            defaultValue={previous?.userCode}
                            required
                            disabled={busy || !selected}
                            options={
                              loaded?.options.users.map((v) => ({
                                value: v.code,
                                label: v.name,
                              })) || []
                            }
                          />
                        </Field>
                      </div>
                      {privacyNotice && <Accordion type="single" collapsible>
                        <AccordionItem value="privacy">
                          <AccordionTrigger>
                            개인정보 수집·이용 안내
                          </AccordionTrigger>
                          <AccordionContent>
                            <p className="whitespace-pre-wrap text-muted-foreground">
                              {privacyNotice}
                            </p>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>}
                      <Field
                        orientation="horizontal"
                        data-disabled={!selected || busy}
                      >
                        <Checkbox
                          id="event-consent"
                          name="consent"
                          required
                          disabled={busy || !selected}
                        />
                        <FieldContent>
                          <FieldLabel htmlFor="event-consent">
                            개인정보 제공과 시설 사용 지침에 동의합니다.
                          </FieldLabel>
                          <FieldDescription>
                            신청 전에 학교의 유의사항과 안내를 확인해주세요.
                          </FieldDescription>
                        </FieldContent>
                      </Field>
                      <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="submit"
                        disabled={busy || !selected}
                        className="w-full"
                      >
                        {activity === "submit" ? (
                          <Spinner data-icon="inline-start" />
                        ) : (
                          <ArrowRightIcon data-icon="inline-start" />
                        )}
                        학교에 신청하기
                      </Button>
                      <Button type="submit" value="draft" formNoValidate variant="outline" disabled={busy || !selected || pausedAreas.includes(selected.area)}>
                        {activity === "draft" && <Spinner data-icon="inline-start" />}
                        임시 저장
                      </Button>
                      </div>
                      {selected && pausedAreas.includes(selected.area) && (
                        <p className="type-body-sm text-muted-foreground">이 공간은 현재 임시 저장이 중지되어 있습니다.</p>
                      )}
                    </FieldGroup>
                  </FieldSet>
                </form>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-wrap">
              {confirmation?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const action = confirmation;
                setConfirmation(null);
                if (action) void run(action.run);
              }}
            >
              {confirmation?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
