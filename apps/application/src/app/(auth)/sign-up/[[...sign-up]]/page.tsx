import { SignUp } from "@clerk/nextjs";

export const runtime = "edge";

export default function Page() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 h-screen">
      <SignUp />
    </div>
  );
}
