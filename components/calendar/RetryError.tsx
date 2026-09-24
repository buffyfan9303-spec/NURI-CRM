"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/ui/ErrorState";

/** ErrorState는 onRetry 콜백이 필요한데 page.tsx는 서버 컴포넌트라 함수를 못 넘긴다. */
export function RetryError({ title, description }: { title?: string; description?: string }) {
  const router = useRouter();
  const [retrying, setRetrying] = React.useState(false);
  return (
    <ErrorState
      title={title}
      description={description}
      retrying={retrying}
      onRetry={() => {
        setRetrying(true);
        router.refresh();
        setTimeout(() => setRetrying(false), 600);
      }}
    />
  );
}
