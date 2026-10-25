import { lazy, Suspense, useEffect, useState } from "react";

import { logout } from "@/api/auth-adapter";
import { getConfig } from "@/api/config-adapter";
import AuthFlow from "@/components/auth/AuthFlow";
import AppShell from "@/components/layout/AppShell";
import GoalsPage from "@/features/goals/GoalsPage";

const GoalDesignPreview = import.meta.env.DEV
  ? lazy(() => import("@/features/goals/GoalDesignPreview"))
  : null;

type AppScreen = "loading" | "auth" | "main";

export default function App() {
  if (GoalDesignPreview && new URLSearchParams(window.location.search).get("preview") === "goals") {
    return <Suspense fallback={<p>Готовим демо-макет…</p>}><GoalDesignPreview /></Suspense>;
  }
  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const [screen, setScreen] = useState<AppScreen>("loading");
  const [surface, setSurface] = useState<"goals" | "assistant">("goals");
  const [deploymentMode, setDeploymentMode] = useState<"local" | "managed">("local");
  const [installMode, setInstallMode] = useState<"dev" | "local" | "prod" | "unknown">(
    "unknown"
  );
  const [installLocation, setInstallLocation] = useState<"local" | "managed" | "unknown">("unknown");
  const [appVersion, setAppVersion] = useState<string>("unknown");

  useEffect(() => {
    let isCancelled = false;
    void getConfig().then((config) => {
      if (isCancelled) {
        return;
      }
      setDeploymentMode(config.mode);
      setInstallMode(config.installMode);
      setInstallLocation(config.installLocation);
      setAppVersion(config.appVersion);

      if (config.mode === "managed") {
        // Managed mode: user is already authenticated via gateway proxy headers.
        // Skip the auth screen entirely.
        setScreen("main");
      } else {
        setScreen("auth");
      }
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  if (screen === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bd-bg-primary px-4">
        <p className="text-sm text-bd-text-secondary">Готовим твоё пространство…</p>
      </div>
    );
  }

  if (screen === "auth") {
    return (
      <AuthFlow mode={deploymentMode} onAuthenticated={() => {
        setSurface("goals");
        setScreen("main");
      }} />
    );
  }

  function handleLogout() {
    void logout().finally(() => {
      if (deploymentMode === "managed") {
        window.location.href = "/api/gateway/auth/logout";
      } else {
        setScreen("auth");
      }
    });
  }

  if (surface === "goals") {
    return <GoalsPage onLogout={handleLogout} onOpenAssistant={() => setSurface("assistant")} />;
  }

  return <>
    <button type="button" onClick={() => setSurface("goals")}
      className="fixed right-5 top-4 z-50 rounded-full border border-bd-border bg-bd-bg-secondary px-4 py-2 text-sm text-bd-text-primary">
      К моей цели
    </button>
    <AppShell
      deploymentMode={deploymentMode}
      installMode={installMode}
      installLocation={installLocation}
      appVersion={appVersion}
      onLogout={handleLogout}
    />
  </>;
}
