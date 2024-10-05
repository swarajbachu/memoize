import { SignUp } from "@clerk/nextjs";
import React from "react";

export default function Page() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 h-screen">
      <SignUp />
    </div>
  );
}
