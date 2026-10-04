import { Suspense } from "react";
import LoginForm from "./LoginForm";

// クライアント側で useSearchParams を使うため Suspense で包む(静的プリレンダー時の要件)
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
