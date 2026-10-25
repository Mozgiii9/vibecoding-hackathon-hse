import { useState } from "react";
import { ArrowLeft } from "lucide-react";

type ForgotPasswordPageProps = {
  mode: "local" | "managed";
  onRequestReset?: (email: string) => void;
  onNavigateToLogin: () => void;
};

export default function ForgotPasswordPage({
  mode,
  onRequestReset,
  onNavigateToLogin
}: ForgotPasswordPageProps) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!onRequestReset || !email.trim()) return;
    onRequestReset(email.trim());
    setSubmitted(true);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bd-bg-primary px-4 py-8">
      <div className="w-full max-w-[400px]">
        <div className="mb-10 flex flex-col items-center gap-3">
          <p className="text-sm text-bd-text-secondary">Рядом</p>
          <h1 className="text-2xl font-semibold text-bd-text-heading">Восстановление доступа</h1>
        </div>

        {mode === "local" || !onRequestReset ? (
          <div className="space-y-3 rounded-lg border border-bd-border bg-bd-bg-secondary p-5">
            <h2 className="text-sm font-medium text-bd-text-primary">Обратитесь к администратору</h2>
            <p className="text-sm leading-relaxed text-bd-text-secondary">
              {mode === "local"
                ? "В этом приложении нет сброса пароля по почте. Если вы забыли пароль, попросите владельца сервера восстановить доступ."
                : "Восстановление по почте сейчас недоступно. Обратитесь к администратору приложения."}
            </p>
            <p className="text-sm leading-relaxed text-bd-text-muted">Не передавайте пароль другим людям.</p>
          </div>
        ) : submitted ? (
          <div role="status" className="rounded-lg border border-bd-border bg-bd-bg-secondary p-5 text-center">
            <h2 className="mb-2 text-sm font-medium text-bd-text-primary">Проверьте почту</h2>
            <p className="text-sm text-bd-text-secondary">
              Если аккаунт с адресом {email} существует, вы получите инструкции по восстановлению доступа.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-center text-sm text-bd-text-secondary">Введите почту, указанную при регистрации.</p>
            <div>
              <label htmlFor="reset-email" className="mb-1.5 block text-sm font-medium text-bd-text-secondary">Электронная почта</label>
              <input id="reset-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" autoFocus required
                className="h-11 w-full rounded-lg border border-bd-border bg-bd-bg-tertiary px-4 text-sm text-bd-text-primary outline-none placeholder:text-bd-text-muted focus:border-bd-amber" />
            </div>
            <button type="submit" disabled={!email.trim()}
              className="h-11 w-full rounded-xl bg-bd-amber text-sm font-medium text-bd-bg-primary transition-colors duration-200 hover:bg-bd-amber-hover disabled:cursor-not-allowed disabled:opacity-50">Получить инструкции</button>
          </form>
        )}

        <button type="button" onClick={onNavigateToLogin}
          className="mt-6 flex min-h-11 w-full items-center justify-center gap-2 text-sm text-bd-text-secondary transition-colors hover:text-bd-amber">
          <ArrowLeft size={14} strokeWidth={1.5} />Вернуться ко входу
        </button>
      </div>
    </main>
  );
}
