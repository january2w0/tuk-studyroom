import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRightIcon, GraduationCapIcon, MapPinIcon, Settings2Icon } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { currentUser } from "@/lib/auth";
import { schoolConnectionStatus } from "@/lib/school/connection";

export const metadata: Metadata = { title: "프로젝트 소개 | 바로룸" };

const features = [
  {
    id: "student-features",
    role: "학생",
    icon: GraduationCapIcon,
    items: [
      ["공간 조회와 신청", "날짜와 시간에 맞는 빈 공간을 찾아 학교에 신청합니다."],
      ["내 예약", "임시 저장한 신청서를 이어서 작성하고, 지난 신청의 상태를 확인하거나 다시 신청합니다."],
    ],
  },
  {
    id: "admin-features",
    role: "관리자",
    icon: Settings2Icon,
    items: [
      ["공간별 설정", "공간별 임시 저장을 허용하거나 중지합니다."],
      ["임시 저장 내역 검색", "학생이 임시 저장한 내역을 행사명, 공간명, 이용 날짜로 검색합니다."],
    ],
  },
];

const specs = [
  { label: "사용자 화면", value: "React · TypeScript", detail: "Tailwind CSS와 shadcn/ui로 학생과 관리자 화면을 구성했습니다." },
  { label: "서버 · 학교 연동", value: "Next.js", detail: "학교 통합정보시스템에서 빈 공간을 조회하고 예약 신청과 취소를 처리합니다." },
  { label: "데이터베이스", value: "MySQL", detail: "공간 설정과 예약 기록을 저장하고, 연락처와 참석자 명단은 암호화해 보관합니다." },
  { label: "웹 배포", value: "Vercel", detail: "GitHub의 main 브랜치에 변경 사항을 올리면 웹 앱을 자동으로 배포합니다." },
];

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

        <section
          aria-labelledby="project-purpose"
          className="grid gap-4 rounded-lg bg-primary px-4 py-6 break-keep text-primary-foreground sm:p-6 md:grid-cols-2 md:items-center md:gap-8 md:px-8 md:py-9"
        >
          <div className="flex flex-col gap-2.5">
            <p className="flex items-center gap-1.5 type-label-md text-primary-foreground/90">
              <MapPinIcon aria-hidden="true" className="size-4" />
              한국공학대학교
            </p>
            <h2 id="project-purpose" className="type-display-md">교내 공간 예약을 간편하게</h2>
          </div>
          <p className="type-body-md leading-6 text-primary-foreground/90 md:border-l md:border-primary-foreground/25 md:pl-8">
            학교 통합정보시스템에서 여러 메뉴를 거쳐야 했던 공간 조회와 예약 신청을 한곳에 모았습니다.
          </p>
        </section>

        <div className="grid gap-4 break-keep md:grid-cols-2 md:gap-6">
          {features.map(({ id, role, icon: Icon, items }) => (
            <Card key={id} role="region" aria-labelledby={id} className="gap-0 overflow-hidden py-0 sm:py-0">
              <CardHeader className="flex items-center gap-3 border-b bg-surface-section px-4 py-3.5 [.border-b]:pb-3.5">
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-md bg-accent text-primary">
                  <Icon className="size-5" />
                </span>
                <CardTitle id={id} className="type-heading-md">{role}</CardTitle>
              </CardHeader>
              <dl className="grid flex-1 divide-y md:auto-rows-fr">
                {items.map(([title, description]) => (
                  <div key={title} className="flex flex-col justify-center gap-1 px-4 py-4 sm:px-6">
                    <dt className="type-label-md">{title}</dt>
                    <dd className="type-body-md text-muted-foreground">{description}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
        </div>

        <Card role="region" aria-labelledby="project-specs" className="gap-0 overflow-hidden py-0 sm:py-0">
          <div className="flex items-center justify-between gap-3 border-b bg-surface-section px-4 py-3 sm:px-6">
            <CardTitle id="project-specs" className="type-heading-md">구현 사양</CardTitle>
            <Button asChild variant="ghost" size="sm" className="-mr-2 text-primary">
              <Link href="/school/schema">DB 구조 보기 <ArrowRightIcon aria-hidden="true" /></Link>
            </Button>
          </div>
          <dl className="grid gap-px bg-border break-keep sm:grid-cols-2 lg:grid-cols-4">
            {specs.map(({ label, value, detail }) => (
              <div key={label} className="bg-card px-4 py-4 sm:px-6 sm:py-5">
                <dt className="type-label-sm text-muted-foreground">{label}</dt>
                <dd className="mt-1.5 type-heading-md text-primary">{value}</dd>
                <dd className="mt-2 type-body-md text-muted-foreground">{detail}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </main>
    </div>
  );
}
