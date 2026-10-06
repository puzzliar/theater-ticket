import { Suspense } from "react";
import SignupForm from "./SignupForm";

export default function SignupPage() {
  return (
    <div className="mx-auto mt-6 max-w-md rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
    </div>
  );
}
