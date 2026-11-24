import type { Metadata } from "next";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";
export const metadata: Metadata = {
  title: "바로룸 | 교내 공간 예약",
  description: "한국공학대학교 교내 공간 예약과 신청 내역 관리",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
