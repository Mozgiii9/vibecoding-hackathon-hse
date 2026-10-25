import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { logout } from "@/api/auth-adapter";
import { getConfig } from "@/api/config-adapter";
import AuthFlow from "@/components/auth/AuthFlow";
import GoalsPage from "@/features/goals/GoalsPage";
import ContextChatPage from "@/features/context-chat/ContextChatPage";
import { emptyChatDraft } from "@/features/context-chat/useContextChat";

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
  const location = useLocation();
  const navigate = useNavigate();
  const [chatDraft, setChatDraft] = useState(emptyChatDraft);
  const [deploymentMode, setDeploymentMode] = useState<"local" | "managed">("local");

  useEffect(() => {
    let isCancelled = false;
    void getConfig().then((config) => {
      if (isCancelled) {
        return;
      }
      setDeploymentMode(config.mode);

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
        setChatDraft(emptyChatDraft());
        setScreen("main");
      }} />
    );
  }

  function handleLogout() {
    // Unmount the conversation immediately so a previous session cannot publish
    // a late reply or retain an unsent private draft while logout completes.
    setScreen("loading");
    setChatDraft(emptyChatDraft());
    void logout().finally(() => {
      if (deploymentMode === "managed") {
        window.location.href = "/api/gateway/auth/logout";
      } else {
        navigate("/", { replace: true });
        setScreen("auth");
      }
    });
  }

  if (location.pathname !== "/chat") {
    return <GoalsPage onLogout={handleLogout} onOpenAssistant={() => navigate("/chat")} />;
  }

  return <ContextChatPage goalId="demo" draft={chatDraft} onDraftChange={setChatDraft} onBack={() => navigate("/")} onLogout={handleLogout} />;
}
