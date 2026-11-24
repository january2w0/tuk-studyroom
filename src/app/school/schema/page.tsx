import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { AppHeader } from "@/components/app-header";
import { Card, CardTitle } from "@/components/ui/card";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { schoolConnectionStatus } from "@/lib/school/connection";

import { RelationLegend, ReservationErd, tableLabels, type SchemaColumn, type UniqueKey } from "./reservation-erd";

export const metadata: Metadata = { title: "DB 구조 | 바로룸" };

const tableNames = Object.keys(tableLabels);

export default async function SchemaPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const [connection, [versions], [columns], [uniqueKeys]] = await Promise.all([
    schoolConnectionStatus(user.id),
    db.query<(RowDataPacket & { version: string })[]>("SELECT VERSION() AS version"),
    db.execute<(RowDataPacket & SchemaColumn)[]>(
      `SELECT c.TABLE_NAME AS tableName, c.COLUMN_NAME AS name, c.COLUMN_TYPE AS type,
              c.IS_NULLABLE AS nullable, c.COLUMN_KEY AS columnKey,
              CONCAT(k.REFERENCED_TABLE_NAME, '.', k.REFERENCED_COLUMN_NAME) AS fkTarget
       FROM information_schema.COLUMNS c
       LEFT JOIN information_schema.KEY_COLUMN_USAGE k
         ON k.TABLE_SCHEMA = c.TABLE_SCHEMA AND k.TABLE_NAME = c.TABLE_NAME
         AND k.COLUMN_NAME = c.COLUMN_NAME AND k.REFERENCED_TABLE_NAME IS NOT NULL
       WHERE c.TABLE_SCHEMA = DATABASE()
         AND c.TABLE_NAME IN (${tableNames.map(() => "?").join(",")})
       ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION`,
      tableNames,
    ),
    db.execute<(RowDataPacket & UniqueKey)[]>(
      `SELECT TABLE_NAME AS tableName, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS \`columns\`
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND NON_UNIQUE = 0
         AND TABLE_NAME IN (${tableNames.map(() => "?").join(",")})
       GROUP BY TABLE_NAME, INDEX_NAME`,
      tableNames,
    ),
  ]);

  const version = versions[0].version.split("-")[0];
  return (
    <div className="school-shell">
      <div className="school-atmosphere" aria-hidden="true" />
      <AppHeader name={user.display_name} role={user.role} active="schema" connection={connection} />
      <main className="page-container flex max-w-6xl flex-col gap-6 py-6 sm:gap-7 sm:pt-7 sm:pb-9">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <h1 className="type-display-md">DB 구조</h1>
          <p className="type-body-sm text-muted-foreground sm:border-l sm:border-boundary-strong sm:py-1 sm:pl-6">
            MySQL {version}
          </p>
        </div>

        <Card className="gap-0 overflow-hidden py-0 sm:py-0">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b px-4 py-4 sm:px-6">
            <CardTitle className="type-heading-md">개체 관계도</CardTitle>
            <RelationLegend />
          </div>
          <ReservationErd columns={columns} uniqueKeys={uniqueKeys} />
        </Card>
      </main>
    </div>
  );
}
