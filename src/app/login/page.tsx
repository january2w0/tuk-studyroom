import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { Brand } from "@/components/app-header";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import LoginForm from "./login-form";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ school?: string }>;
}) {
  if ((await currentUser()) && (await searchParams).school !== "1")
    redirect("/");
  return (
    <main className="page-container flex min-h-svh max-w-6xl flex-col py-6">
      <section className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-7 py-12">
        <h1 className="flex justify-center" aria-label="바로룸 로그인">
          <Brand />
        </h1>
        <LoginForm />
        <Accordion type="single" collapsible>
          <AccordionItem value="account">
            <AccordionTrigger>학교 계정과 로그인 유지 안내</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              학교 로그인 정보는 학교 포털 인증 서버(ksc.tukorea.ac.kr)에
              HTTPS로 전송됩니다. 학교 세션은 사용자별로 암호화하며, 비밀번호는
              자동 로그인에 동의한 경우에만 최대 30일 보관합니다.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="demo">
            <AccordionTrigger>앱 계정 안내</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              과제 시연에는 앱 계정 student 또는 admin을 사용할 수 있습니다.
              초기 비밀번호는 프로젝트의 SETUP.local.txt에서 확인하세요.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>
    </main>
  );
}
