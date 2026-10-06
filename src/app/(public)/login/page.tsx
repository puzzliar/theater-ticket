import { Suspense } from "react";
import LoginForm from "./LoginForm";

// クライアント側で useSearchParams を使うため Suspense で包む(静的プリレンダー時の要件)
export default function LoginPage() {
  return (
    <div className="mx-auto mt-6 max-w-md rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
