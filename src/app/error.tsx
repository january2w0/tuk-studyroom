"use client";
import { AlertCircleIcon, RefreshCwIcon } from "lucide-react";
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
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="page-container flex min-h-svh items-center justify-center py-8">
      <Card className="w-full max-w-lg">
        <CardContent>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <AlertCircleIcon />
              </EmptyMedia>
              <EmptyTitle>연결을 다시 확인해주세요</EmptyTitle>
              <EmptyDescription>
                서버 연결을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={reset}>
                <RefreshCwIcon data-icon="inline-start" />
                다시 시도
              </Button>
            </EmptyContent>
          </Empty>
        </CardContent>
      </Card>
    </main>
  );
}
