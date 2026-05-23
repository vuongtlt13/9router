import { Suspense } from "react";
import { CardSkeleton } from "@/shared/components";
import RtkDashboardClient from "./RtkDashboardClient";

export default function RtkPage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <RtkDashboardClient />
    </Suspense>
  );
}
