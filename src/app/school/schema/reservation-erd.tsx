import type { CSSProperties } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type Table = "users" | "sessions" | "school_connections" | "rooms" | "school_booking_records" | "school_requests";
type Position = readonly [x: number, y: number, width: number, height: number];
export type SchemaColumn = {
  tableName: string;
  name: string;
  type: string;
  nullable: "YES" | "NO";
  columnKey: string;
  fkTarget: string | null;
};
export type UniqueKey = { tableName: string; columns: string };
type Relation = {
  path: string;
  foreignKey: string;
  target: Table;
  childFirst?: boolean;
};
type Layout = { width: number; height: number; nodes: Record<Table, Position>; edges: Relation[] };

export const tableLabels: Record<Table, string> = {
  users: "사용자", sessions: "로그인 세션", school_connections: "학교 계정 연결",
  rooms: "공간 설정", school_booking_records: "예약 기록", school_requests: "학교 신청 요청",
};

// Card positions and relationship paths use the same coordinate system.
const wide: Layout = {
  width: 1000, height: 310,
  nodes: {
    sessions: [0, 0, 202, 108], users: [399, 0, 202, 108], school_connections: [798, 0, 202, 108],
    rooms: [0, 184, 202, 126],
    school_booking_records: [399, 184, 202, 126], school_requests: [798, 184, 202, 126],
  },
  edges: [
    { path: "M202 54 H399", foreignKey: "sessions.user_id", target: "users", childFirst: true },
    { path: "M601 54 H798", foreignKey: "school_connections.user_id", target: "users" },
    { path: "M500 108 V184", foreignKey: "school_booking_records.user_id", target: "users" },
    { path: "M545 108 V134 H899 V184", foreignKey: "school_requests.user_id", target: "users" },
    { path: "M601 246 H798", foreignKey: "school_booking_records.request_id", target: "school_requests", childFirst: true },
  ],
};

const narrow: Layout = {
  width: 320, height: 525,
  nodes: {
    sessions: [0, 0, 143, 100], school_connections: [156, 0, 143, 100], users: [77, 138, 148, 90],
    school_booking_records: [0, 276, 138, 138], school_requests: [180, 276, 140, 138],
    rooms: [77, 442, 148, 83],
  },
  edges: [
    { path: "M70 100 V119 H111 V138", foreignKey: "sessions.user_id", target: "users", childFirst: true },
    { path: "M229 100 V119 H191 V138", foreignKey: "school_connections.user_id", target: "users", childFirst: true },
    { path: "M111 228 V250 H69 V276", foreignKey: "school_booking_records.user_id", target: "users" },
    { path: "M191 228 V250 H250 V276", foreignKey: "school_requests.user_id", target: "users" },
    { path: "M138 346 H180", foreignKey: "school_booking_records.request_id", target: "school_requests", childFirst: true },
  ],
};

const multiplicities = {
  one: "정확히 하나",
  optional: "최대 하나",
  many: "0개 이상",
} as const;
type Multiplicity = keyof typeof multiplicities;

// The circle or inner bar gives the minimum. The mark nearest the entity gives the maximum.
function Endpoint({ kind }: { kind: Multiplicity }) {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="1.35">
      <path d="M0 6H17" />
      {kind === "many" ? <path d="m17 1-10 5 10 5" /> : <path d="M13 1v10" />}
      {kind === "one" ? <path d="M7 1v10" /> : <circle cx="4" cy="6" r="3" fill="var(--surface-section)" />}
    </g>
  );
}

export function RelationLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 type-body-sm text-muted-foreground">
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {(Object.keys(multiplicities) as Multiplicity[]).map((kind) => (
          <li key={kind} className="flex items-center gap-1.5">
            <svg aria-hidden="true" width="19" height="12" viewBox="0 0 19 12" className="text-primary">
              <Endpoint kind={kind} />
            </svg>
            {multiplicities[kind]}
          </li>
        ))}
      </ul>
      <ul className="flex gap-3 sm:border-l sm:pl-5">
        {["식별", "비식별"].map((name) => (
          <li key={name} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`w-5 border-t border-primary ${name === "비식별" ? "border-dashed" : ""}`} />
            {name} 관계
          </li>
        ))}
      </ul>
    </div>
  );
}

function Connections({ layout, columns, uniqueKeys, className }: {
  layout: Layout; columns: SchemaColumn[]; uniqueKeys: UniqueKey[]; className: string;
}) {
  const prefix = layout === wide ? "erd-wide" : "erd-narrow";
  return (
    <svg className={`pointer-events-none absolute inset-0 size-full text-primary ${className}`}
      viewBox={`0 0 ${layout.width} ${layout.height}`} preserveAspectRatio="none" aria-label="테이블 관계">
      <defs>
        {(Object.keys(multiplicities) as Multiplicity[]).map((kind) => (
          <marker key={kind} id={`${prefix}-${kind}`} markerWidth="18" markerHeight="12" refX="17" refY="6"
            markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <Endpoint kind={kind} />
          </marker>
        ))}
      </defs>
      {layout.edges.map((edge) => {
        const fk = columns.find((c) => `${c.tableName}.${c.name}` === edge.foreignKey);
        if (!fk?.fkTarget || fk.fkTarget.split(".")[0] !== edge.target) return null;
        const unique = uniqueKeys.some((key) => key.tableName === fk.tableName && key.columns === fk.name);
        const child = unique ? "optional" : "many";
        const parent = fk.nullable === "YES" ? "optional" : "one";
        const identifying = fk.columnKey === "PRI";
        const description = `${edge.foreignKey}에서 ${fk.fkTarget} 참조, ${identifying ? "식별" : "비식별"} 관계. ${fk.tableName} 하나에 ${edge.target} ${multiplicities[parent]}, ${edge.target} 하나에 ${fk.tableName} ${multiplicities[child]}.`;
        return (
          <path key={edge.foreignKey} d={edge.path} fill="none" stroke="var(--ring)" strokeWidth="1.25"
            strokeDasharray={identifying ? undefined : "4 3"} vectorEffect="non-scaling-stroke"
            markerStart={`url(#${prefix}-${edge.childFirst ? child : parent})`}
            markerEnd={`url(#${prefix}-${edge.childFirst ? parent : child})`} role="img" aria-label={description} />
        );
      })}
    </svg>
  );
}

function position(layout: Layout, table: Table, size: string) {
  const [x, y, w, h] = layout.nodes[table];
  return {
    [`--${size}-x`]: `${x / layout.width * 100}%`,
    [`--${size}-y`]: `${y / layout.height * 100}%`,
    [`--${size}-w`]: `${w / layout.width * 100}%`,
    [`--${size}-h`]: `${h / layout.height * 100}%`,
  };
}

function ColumnDetails({ table, columns, uniqueKeys }: { table: Table; columns: SchemaColumn[]; uniqueKeys: UniqueKey[] }) {
  const compositeKeys = uniqueKeys.filter((key) => key.columns.includes(","));
  return (
    <SheetContent className="w-full gap-0 border-l-0 sm:max-w-lg sm:border-l">
      <SheetHeader className="border-b px-4 py-4 pr-16 sm:px-6">
        <SheetTitle>{tableLabels[table]}</SheetTitle>
        <SheetDescription className="font-mono">{table}</SheetDescription>
      </SheetHeader>
      <div className="min-h-0 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="overflow-hidden rounded-md border bg-card">
          <table className="w-full table-fixed text-left type-body-sm">
            <caption className="sr-only">{table} 컬럼</caption>
            <thead className="border-b bg-surface-section">
              <tr>
                <th scope="col" className="w-[42%] px-2.5 py-2 font-medium">컬럼</th>
                <th scope="col" className="px-2.5 py-2 font-medium">자료형</th>
                <th scope="col" className="w-14 px-2 py-2 font-medium">NULL</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {columns.map((column) => {
                const primary = column.columnKey === "PRI";
                const unique = !primary && uniqueKeys.some((key) => key.columns === column.name);
                const keys = [primary && "PK", column.fkTarget && "FK", unique && "UK"].filter(Boolean);
                return (
                  <tr key={column.name} className="align-top">
                    <th scope="row" className="px-2.5 py-2.5 font-medium">
                      <code className="wrap-anywhere">{column.name}</code>
                      {keys.length > 0 && <span className="block font-mono text-muted-foreground">{keys.join(" · ")}</span>}
                      {column.fkTarget && (
                        <span className="block wrap-anywhere text-muted-foreground">
                          <code>{column.fkTarget}</code> 참조
                        </span>
                      )}
                    </th>
                    <td className="px-2.5 py-2.5"><code className="wrap-anywhere">{column.type}</code></td>
                    <td className="px-2 py-2.5 text-muted-foreground">{column.nullable === "YES" ? "허용" : "불가"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {compositeKeys.map((key) => (
          <p key={key.columns} className="mt-3 type-body-sm text-muted-foreground">
            복합 UK <code>({key.columns.split(",").join(", ")})</code>
          </p>
        ))}
        <p className="mt-3 type-body-sm text-muted-foreground">PK 기본 키 · FK 외래 키 · UK 고유 키</p>
      </div>
    </SheetContent>
  );
}

export function ReservationErd({ columns, uniqueKeys }: { columns: SchemaColumn[]; uniqueKeys: UniqueKey[] }) {
  return (
    <figure aria-label="교내 공간 예약 ERD" className="@container bg-surface-section px-4 py-5 sm:p-6">
      <div className="relative mx-auto h-[32.8125rem] max-w-[30rem] @min-[50rem]:h-[19.375rem] @min-[50rem]:max-w-none">
        <Connections layout={wide} columns={columns} uniqueKeys={uniqueKeys} className="hidden @min-[50rem]:block" />
        <Connections layout={narrow} columns={columns} uniqueKeys={uniqueKeys} className="@min-[50rem]:hidden" />
        {(Object.keys(wide.nodes) as Table[]).map((table) => {
          const fields = columns.filter((c) => c.tableName === table);
          if (!fields.length) return null;
          return (
            <Sheet key={table}>
              <SheetTrigger asChild>
                <button type="button" aria-label={`${tableLabels[table]} (${table}) 스키마 보기`}
                  style={{ ...position(wide, table, "wide"), ...position(narrow, table, "small") } as CSSProperties}
                  className={`focus-control absolute top-(--small-y) left-(--small-x) flex h-(--small-h) w-(--small-w) cursor-pointer flex-col overflow-hidden rounded-md border border-boundary-strong bg-card text-left transition-colors hover:border-primary @min-[50rem]:top-(--wide-y) @min-[50rem]:left-(--wide-x) @min-[50rem]:h-(--wide-h) @min-[50rem]:w-(--wide-w)`}>
                  <span className="block w-full border-b bg-accent/60 px-2.5 py-1.5 @min-[50rem]:px-3">
                    <span className="block type-heading-sm text-primary">
                      {tableLabels[table]}
                    </span>
                    <code className="block wrap-anywhere text-[0.6875rem] leading-[0.875rem] text-muted-foreground">
                      {table.replaceAll("_", "_\u200b")}
                    </code>
                  </span>
                  <span className="flex w-full flex-1 flex-col justify-center px-2.5 py-1 @min-[50rem]:px-3">
                    {fields.filter((c) => c.columnKey === "PRI" || c.fkTarget).map((c) => (
                      <span key={c.name} className="flex items-center justify-between gap-1 font-mono text-[0.6875rem] leading-[1.3125rem]">
                        <span>{c.name}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {c.columnKey === "PRI" && <abbr className="no-underline" title="기본 키">PK</abbr>}
                          {c.columnKey === "PRI" && c.fkTarget && "·"}
                          {c.fkTarget && <abbr className="no-underline" title="외래 키">FK</abbr>}
                        </span>
                      </span>
                    ))}
                  </span>
                </button>
              </SheetTrigger>
              <ColumnDetails table={table} columns={fields} uniqueKeys={uniqueKeys.filter((key) => key.tableName === table)} />
            </Sheet>
          );
        })}
      </div>
    </figure>
  );
}
