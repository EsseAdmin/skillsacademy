"use client";

import { useRouter } from "next/navigation";
import PlanBuildProgress from "@/components/PlanBuildProgress";

// Lets a server page (the admin dashboard) show/continue queued AI builds.
export default function PlanBuildProgressMount({ slug }: { slug: string }) {
  const router = useRouter();
  return <PlanBuildProgress slug={slug} onFinished={() => router.refresh()} />;
}
