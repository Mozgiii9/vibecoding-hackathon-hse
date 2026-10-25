import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { fetchBootstrapStatus, login, restoreSession, signup } from "@/api/auth-adapter";

import ForgotPasswordPage from "./ForgotPasswordPage";
import LoginPage from "./LoginPage";
import SignupPage from "./SignupPage";

type AuthFlowProps = {
  mode: "local" | "managed";
  onAuthenticated: () => void;
};

type AuthScreen = "login" | "signup" | "forgot-password";

/** Maps adapter errors to actionable copy without displaying transport details. */
function authErrorMessage(error: unknown, action = "войти"): string {
  const message = error instanceof Error ? error.message : "";
  const translations: Record<string, string> = {
    "Account already initialized. Please sign in.": "Аккаунт уже создан. Войдите с вашим именем и паролем.",
    "Invalid username or password.": "Неверное имя пользователя или пароль. Проверьте их и попробуйте снова.",
    "Sign-up requires the bootstrap token configured for this runtime.": "Для создания аккаунта нужен токен первого запуска. Обратитесь к администратору приложения.",
    "Sign-up is restricted to localhost until the first account is created.": "Первый аккаунт нужно создать на сервере приложения. Обратитесь к администратору.",
    "Too many attempts. Please wait and try again.": "Слишком много попыток. Подождите немного и попробуйте снова.",
  };
  return translations[message] ?? `Не удалось ${action}. Проверьте соединение и попробуйте снова.`;
}

export default function AuthFlow({ mode, onAuthenticated }: AuthFlowProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [screen, setScreen] = useState<AuthScreen>("login");
  const [error, setError] = useState<string | null>(null);
  const [isLoadingBootstrap, setIsLoadingBootstrap] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accountInitialized, setAccountInitialized] = useState(false);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [bootstrapFailed, setBootstrapFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setIsLoadingBootstrap(true);
    setBootstrapFailed(false);
    setError(null);

    void (async () => {
      try {
        const status = await fetchBootstrapStatus();
        if (cancelled) {
          return;
        }

        setAccountInitialized(status.account_initialized);

        if (status.mode === "local-owner" || status.mode === "managed") {
          onAuthenticated();
          return;
        }

        if (status.mode === "local" && status.account_initialized) {
          const restored = await restoreSession();
          if (!cancelled && restored) {
            onAuthenticated();
            return;
          }
        }

        applyRouteScreen(status.account_initialized);
      } catch {
        if (!cancelled) {
          setAccountInitialized(true);
          setScreen("login");
          setBootstrapFailed(true);
          setError("Не удалось подключиться к приложению. Проверьте соединение и повторите попытку.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingBootstrap(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapAttempt]);

  useEffect(() => {
    if (isLoadingBootstrap || bootstrapFailed) {
      return;
    }

    applyRouteScreen(accountInitialized);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, isLoadingBootstrap, bootstrapFailed, accountInitialized]);

  function applyRouteScreen(isInitialized: boolean): void {
    const wantsSignup = location.pathname.startsWith("/signup");

    if (!isInitialized && mode === "local") {
      setScreen("signup");
      return;
    }

    if (wantsSignup && isInitialized) {
      setError("Аккаунт уже создан. Войдите с вашим именем и паролем.");
      navigate("/", { replace: true });
    }

    if (screen !== "forgot-password") {
      setScreen("login");
    }
  }

  async function handleLogin(credentials: { identifier: string; password: string }): Promise<void> {
    setIsSubmitting(true);
    setError(null);
    try {
      await login(credentials);
      onAuthenticated();
    } catch (submissionError) {
      setError(authErrorMessage(submissionError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignup(credentials: { identifier: string; password: string }): Promise<void> {
    setIsSubmitting(true);
    setError(null);
    try {
      await signup(credentials);
      setAccountInitialized(true);
      onAuthenticated();
    } catch (submissionError) {
      const message = submissionError instanceof Error ? submissionError.message : "Sign-up failed.";
      setError(authErrorMessage(submissionError, "создать аккаунт"));
      if (message.toLowerCase().includes("already initialized")) {
        setAccountInitialized(true);
        setScreen("login");
        navigate("/", { replace: true });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoadingBootstrap) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bd-bg-primary px-4">
        <p role="status" className="text-sm text-bd-text-muted">Готовим безопасный вход…</p>
      </div>
    );
  }

  if (bootstrapFailed) {
    return <main className="flex min-h-dvh items-center justify-center bg-bd-bg-primary px-4 py-8">
      <div className="w-full max-w-[400px] space-y-4 text-center">
        <h1 className="text-2xl font-semibold text-bd-text-heading">Пока не получается войти</h1>
        <p role="alert" className="text-sm text-bd-text-secondary">{error}</p>
        <button type="button" className="h-11 w-full rounded-xl bg-bd-amber text-sm font-medium text-bd-bg-primary" onClick={() => setBootstrapAttempt((attempt) => attempt + 1)}>Повторить подключение</button>
      </div>
    </main>;
  }

  switch (screen) {
    case "login":
      return (
        <LoginPage
          mode={mode}
          error={error}
          isSubmitting={isSubmitting}
          showSignupAction={mode === "local" && !accountInitialized}
          onLogin={handleLogin}
          onNavigateToSignup={() => {
            if (accountInitialized || mode !== "local") {
              return;
            }
            setError(null);
            setScreen("signup");
            navigate("/signup");
          }}
          onNavigateToForgotPassword={() => {
            setError(null);
            setScreen("forgot-password");
            navigate("/");
          }}
        />
      );
    case "signup":
      return (
        <SignupPage
          mode={mode}
          error={error}
          isSubmitting={isSubmitting}
          showLoginAction={mode !== "local" || accountInitialized}
          onSignup={(credentials) => {
            const identifier = mode === "local" ? credentials.username ?? "" : credentials.email ?? "";
            return handleSignup({ identifier, password: credentials.password });
          }}
          onNavigateToLogin={() => {
            setError(null);
            setScreen("login");
            navigate("/");
          }}
        />
      );
    case "forgot-password":
      return (
        <ForgotPasswordPage
          mode={mode}
          onNavigateToLogin={() => {
            setError(null);
            setScreen("login");
            navigate("/");
          }}
        />
      );
  }
}
