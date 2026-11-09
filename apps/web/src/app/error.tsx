"use client";

import { ErrorState } from "@/components/common/states";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState className="min-h-screen" message="An unexpected error occurred while rendering this page." onRetry={reset} />;
}
