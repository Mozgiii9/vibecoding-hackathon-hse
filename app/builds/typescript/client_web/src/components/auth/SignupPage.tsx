import { useState } from "react";

type SignupPageProps = {
  mode: "local" | "managed";
  onSignup: (credentials: {
    username?: string;
    email?: string;
    password: string;
  }) => Promise<void> | void;
  onNavigateToLogin: () => void;
  isSubmitting?: boolean;
  showLoginAction?: boolean;
  error?: string | null;
};

export default function SignupPage({
  mode,
  onSignup,
  onNavigateToLogin,
  isSubmitting = false,
  showLoginAction = true,
  error
}: SignupPageProps) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const passwordMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  const isValid =
    (mode === "local"
      ? username.trim().length > 0 &&
        password.length >= 8 &&
        password === confirmPassword
      : email.trim().length > 0 &&
        password.length >= 8 &&
        password === confirmPassword);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!isValid || isSubmitting) return;

    if (mode === "local") {
      onSignup({ username: username.trim(), password });
    } else {
      onSignup({ email: email.trim(), password });
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bd-bg-primary px-4 py-8">
      <div className="w-full max-w-[400px]">
        <div className="mb-10 flex flex-col items-center">
          <h1 className="text-3xl font-semibold text-bd-text-heading">Рядом</h1>
          <p className="mt-2 text-center text-lg text-bd-text-secondary">
            Создайте вход в своё пространство
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div role="alert" className="rounded-lg border border-bd-danger-border bg-bd-danger-bg px-4 py-3 text-sm text-bd-danger">
              {error}
            </div>
          )}

          {mode === "local" ? (
            <div>
              <label
                htmlFor="username"
                className="mb-1.5 block text-sm font-medium text-bd-text-secondary"
              >
                Имя пользователя
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Придумайте имя пользователя"
                autoComplete="username"
                autoFocus
                required
                className="h-11 w-full rounded-lg border border-bd-border bg-bd-bg-tertiary px-4 text-sm text-bd-text-primary outline-none placeholder:text-bd-text-muted focus:border-bd-amber"
              />
            </div>
          ) : (
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-bd-text-secondary"
              >
                Электронная почта
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus
                required
                className="h-11 w-full rounded-lg border border-bd-border bg-bd-bg-tertiary px-4 text-sm text-bd-text-primary outline-none placeholder:text-bd-text-muted focus:border-bd-amber"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="new-password"
              className="mb-1.5 block text-sm font-medium text-bd-text-secondary"
            >
              Пароль
            </label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Не меньше 8 символов"
              autoComplete="new-password"
              required
              minLength={8}
              className="h-11 w-full rounded-lg border border-bd-border bg-bd-bg-tertiary px-4 text-sm text-bd-text-primary outline-none placeholder:text-bd-text-muted focus:border-bd-amber"
            />
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="mb-1.5 block text-sm font-medium text-bd-text-secondary"
            >
              Повторите пароль
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Введите пароль ещё раз"
              aria-invalid={passwordMismatch}
              aria-describedby={passwordMismatch ? "password-mismatch" : undefined}
              autoComplete="new-password"
              required
              className={[
                "h-11 w-full rounded-lg border bg-bd-bg-tertiary px-4 text-sm text-bd-text-primary outline-none placeholder:text-bd-text-muted focus:border-bd-amber",
                passwordMismatch ? "border-bd-danger" : "border-bd-border"
              ].join(" ")}
            />
            {passwordMismatch && (
              <p id="password-mismatch" role="status" className="mt-1.5 text-xs text-bd-danger">
                Пароли не совпадают
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!isValid || isSubmitting}
            className="h-11 w-full rounded-xl bg-bd-amber text-sm font-medium text-bd-bg-primary transition-colors duration-200 hover:bg-bd-amber-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Создаём аккаунт…" : "Создать аккаунт"}
          </button>
        </form>

        {showLoginAction && <p className="mt-6 text-center text-sm text-bd-text-muted">
          Уже есть аккаунт?{" "}
          <button
            type="button"
            onClick={onNavigateToLogin}
            className="text-bd-amber transition-colors hover:text-bd-amber-hover"
          >
            Войти
          </button>
        </p>}

        {mode === "local" && (
          <p className="mt-4 text-center text-xs text-bd-text-muted">
            Аккаунт создаётся на сервере этого приложения. После входа вы зададите цель и три критерия прогресса.
          </p>
        )}
      </div>
    </div>
  );
}
