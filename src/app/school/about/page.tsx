import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GraduationCapIcon, Settings2Icon } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Card } from "@/components/ui/card";
import { currentUser } from "@/lib/auth";
import { schoolConnectionStatus } from "@/lib/school/connection";

export const metadata: Metadata = { title: "프로젝트 소개 | 바로룸" };

export default async function AboutPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const connection = await schoolConnectionStatus(user.id);
  return (
    <div className="school-shell">
      <div className="school-atmosphere" aria-hidden="true" />
      <AppHeader name={user.display_name} role={user.role} active="about" connection={connection} />
      <main className="page-container flex max-w-6xl flex-col gap-6 py-6 sm:gap-7 sm:pt-7 sm:pb-9">
        <h1 className="type-display-md">프로젝트 소개</h1>

        <Card className="grid gap-0 overflow-hidden py-0 break-keep sm:py-0 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section className="flex flex-col justify-center gap-4 bg-primary px-4 py-6 text-primary-foreground sm:p-8" aria-labelledby="project-purpose">
            <h2 id="project-purpose" className="type-display-md text-balance">교내 공간 예약을 간편하게</h2>
            <p className="max-w-80 type-body-md text-primary-foreground/90">
              한국공학대학교 통합정보시스템에서 여러 메뉴를 거치던 공간 조회와 예약 신청을 한곳에서 할 수 있도록 만들었습니다.
            </p>
          </section>

          <div className="divide-y md:border-l">
            <section className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 px-4 py-5 sm:gap-4 sm:p-6" aria-labelledby="student-features">
              <span aria-hidden="true" className="grid size-9 place-items-center rounded-md bg-accent text-primary">
                <GraduationCapIcon className="size-5" />
              </span>
              <div className="flex flex-col gap-2">
                <h2 id="student-features" className="type-heading-md">학생</h2>
                <ul className="list-disc space-y-1 pl-4 type-body-md text-muted-foreground">
                  <li>날짜와 시간에 맞는 빈 공간을 찾아 학교에 신청합니다.</li>
                  <li>신청서를 임시 저장하고, 내 예약에서 신청 상태를 확인하거나 다시 신청합니다.</li>
                </ul>
              </div>
            </section>

            <section className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 px-4 py-5 sm:gap-4 sm:p-6" aria-labelledby="admin-features">
              <span aria-hidden="true" className="grid size-9 place-items-center rounded-md bg-accent text-primary">
                <Settings2Icon className="size-5" />
              </span>
              <div className="flex flex-col gap-2">
                <h2 id="admin-features" className="type-heading-md">관리자</h2>
                <ul className="list-disc space-y-1 pl-4 type-body-md text-muted-foreground">
                  <li>공간별 임시 저장을 허용하거나 중지합니다.</li>
                  <li>학생의 임시 저장 내역을 검색합니다.</li>
                </ul>
              </div>
            </section>
          </div>
        </Card>
      </main>
    </div>
  );
}
