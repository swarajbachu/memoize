"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import useDeviceType from "~/hooks/use-device-type";
import { useEntries } from "~/hooks/use-entries";

export default function EntryPage() {
  const { descEntries, isLoading } = useEntries();
  const recentEntry = descEntries[0];
  const deviceType = useDeviceType();
  const router = useRouter();

  // useEffect(() => {
  //   if (deviceType === "desktop") {
  //     router.replace(`/entries/${recentEntry?.id}`);
  //   }
  // }, [deviceType, recentEntry]);

  return;
}
