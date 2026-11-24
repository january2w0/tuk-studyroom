"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Spinner } from "@/components/ui/spinner";
export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"school" | "app">("school");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-6">
      <ToggleGroup
        type="single"
        value={mode}
        variant="outline"
        className="grid w-full grid-cols-2"
        aria-label="로그인 방식"
        disabled={busy}
        onValueChange={(value) => {
          if (value) {
            setMode(value as "school" | "app");
            setError("");
            toast.dismiss("login-error");
          }
        }}
      >
        <ToggleGroupItem value="school" className="w-full">
          학교 계정
        </ToggleGroupItem>
        <ToggleGroupItem value="app" className="w-full">
          앱 계정
        </ToggleGroupItem>
      </ToggleGroup>
      <form
        key={mode}
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          toast.dismiss("login-error");
          const data = new FormData(event.currentTarget);
          try {
            const res = await fetch(
              mode === "school" ? "/api/school/login" : "/api/login",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  username: data.get("username"),
                  password: data.get("password"),
                  remember: data.get("remember") === "on",
                  autoLogin: data.get("autoLogin") === "on",
                }),
              },
            );
            const body = await res.json();
            if (!res.ok) throw new Error(body.error);
            router.replace(mode === "school" ? "/school" : "/");
            router.refresh();
          } catch (e) {
            const message = e instanceof Error ? e.message : "연결을 확인해주세요.";
            setError(message);
            toast.error(message, { id: "login-error" });
          } finally {
            setBusy(false);
          }
        }}
      >
        <FieldGroup>
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="login-id">
              {mode === "school" ? "학교 아이디" : "앱 아이디"}
            </FieldLabel>
            <Input
              id="login-id"
              name="username"
              autoComplete="username"
              placeholder={mode === "school" ? "포털 아이디" : "앱 전용 아이디"}
              required
              maxLength={80}
              disabled={busy}
              aria-invalid={!!error}
            />
          </Field>
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="login-password">비밀번호</FieldLabel>
            <Input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="비밀번호 입력"
              required
              maxLength={256}
              disabled={busy}
              aria-invalid={!!error}
            />
          </Field>
          {mode === "school" && (
            <Field orientation="horizontal">
              <Checkbox id="auto-login" name="autoLogin" disabled={busy} />
              <FieldContent>
                <FieldLabel htmlFor="auto-login">
                  학교 세션 만료 시 자동 로그인
                </FieldLabel>
                <FieldDescription>
                  선택하면 비밀번호를 암호화해 최대 30일 보관합니다.
                </FieldDescription>
              </FieldContent>
            </Field>
          )}
          <Field orientation="horizontal">
            <Checkbox
              id="remember"
              name="remember"
              defaultChecked
              disabled={busy}
            />
            <FieldContent>
              <FieldLabel htmlFor="remember">
                이 앱에서 30일 동안 로그인 유지
              </FieldLabel>
            </FieldContent>
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Spinner data-icon="inline-start" />}
            {busy ? "로그인 확인 중" : "로그인"}
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
}
