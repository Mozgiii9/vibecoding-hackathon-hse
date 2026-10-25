import GoalWorkspaceView from "./GoalWorkspaceView";
import { useGoalWorkspace } from "./useGoalWorkspace";

type GoalsPageProps = {
  onLogout: () => void;
  onOpenAssistant?: () => void;
};

/** Connects the goal screen to the authenticated, server-owned workspace state. */
export default function GoalsPage({ onLogout, onOpenAssistant }: GoalsPageProps) {
  const workspace = useGoalWorkspace("demo");
  return <GoalWorkspaceView workspace={workspace} onLogout={onLogout} onOpenAssistant={onOpenAssistant} />;
}
