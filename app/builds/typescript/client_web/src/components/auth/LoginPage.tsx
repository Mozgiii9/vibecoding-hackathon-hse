import { useState } from "react";

type LoginPageProps = {
  mode: "local" | "managed";
  onLogin: (credentials: { identifier: string; password: string }) => Promise<void> | void;
  onNavigateToSignup: () => void;
  onNavigateToForgotPassword: () => void;
  showSignupAction?: boolean;
  isSubmitting?: boolean;
  error?: string | null;
};

export default function LoginPage({
  mode,
  onLogin,
  onNavigateToSignup,
  onNavigateToForgotPassword,
  showSignupAction = true,
  isSubmitting = false,
  error
}: LoginPageProps) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  const identifierLabel = mode === "local" ? "Имя пользователя" : "Электронная почта";
  const identifierPlaceholder =
    mode === "local" ? "Введите имя пользователя" : "you@example.com";
  const identifierType = mode === "local" ? "text" : "email";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting || !identifier.trim() || !password) return;
    onLogin({ identifier: identifier.trim(), password });
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bd-bg-primary px-4 py-8">
      <div className="w-full max-w-[400px]">
        <div className="mb-10 flex flex-col items-center">
          <h1 className="text-3xl font-semibold text-bd-text-heading">Рядом</h1>
          <p className="mt-2 text-lg text-bd-text-secondary">
            Вернёмся к вашей цели
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div role="alert" className="rounded-lg border border-bd-danger-border bg-bd-danger-bg px-4 py-3 text-sm text-bd-danger">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="identifier"
              className="mb-1.5 block text-sm font-medium text-bd-text-secondary"
            >
              {identifierLabel}
            </label>
            <input
              id="identifier"
              type={identifierType}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={identifierPlaceholder}
              autoComplete="username"
              autoFocus
              required
              className="h-11 w-full rounded-lg border border-bd-border bg-bd-bg-tertiary px-4 text-sm text-bd-text-primary outline-none placeholder:text-bd-text-muted focus:border-bd-amber"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor="password"
                className="text-sm font-medium text-bd-text-secondary"
              >
                Пароль
              </label>
              <button
                type="button"
                onClick={onNavigateToForgotPassword}
                className="text-xs text-bd-text-muted transition-colors hover:text-bd-amber"
              >
                Забыли пароль?
              </button>
            </div>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Введите пароль"
              autoComplete="current-password"
              required
              className="h-11 w-full rounded-lg border border-bd-border bg-bd-bg-tertiary px-4 text-sm text-bd-text-primary outline-none placeholder:text-bd-text-muted focus:border-bd-amber"
            />
          </div>

          <button
            type="submit"
            disabled={!identifier.trim() || !password || isSubmitting}
            className="h-11 w-full rounded-xl bg-bd-amber text-sm font-medium text-bd-bg-primary transition-colors duration-200 hover:bg-bd-amber-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Входим…" : "Войти"}
          </button>
        </form>

        {showSignupAction && (
          <p className="mt-6 text-center text-sm text-bd-text-muted">
            Ещё нет аккаунта?{" "}
            <button
              type="button"
              onClick={onNavigateToSignup}
              className="text-bd-amber transition-colors hover:text-bd-amber-hover"
            >
              Создать аккаунт
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
