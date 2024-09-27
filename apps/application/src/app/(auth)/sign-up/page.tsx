import React from "react";
import RegisterForm from "~/components/auth/register-form";

export default function SignUpPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 h-screen">
      <RegisterForm />
    </div>
  );
}
