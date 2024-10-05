import { SignUp } from "@clerk/nextjs";
import React from "react";

export const runtime = "edge";

export default function Page() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 h-screen">
      <SignUp />
    </div>
  );
}
