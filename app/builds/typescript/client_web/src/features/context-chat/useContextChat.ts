import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "./api";

export interface ContextChatDraft { text: string; requestId: string | null }
export const emptyChatDraft = (): ContextChatDraft => ({ text: "", requestId: null });
export const CHAT_REQUEST_TIMEOUT_MS = 130_000;
type ErrorState = { message: string; unauthorized: boolean } | null;
interface State { goalId: string; thread: api.ContextChatThread | null; loading: boolean; sending: boolean; error: ErrorState }

async function withSignal<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new DOMException("Request stopped", "AbortError"));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([operation, cancelled]); }
  finally { signal.removeEventListener("abort", onAbort); }
}

/** The App owns the unsent draft; this hook owns cancellable, goal-scoped server requests. */
export function useContextChat(goalId: string, draft: ContextChatDraft, onDraftChange: (draft: ContextChatDraft) => void) {
  const [state, setState] = useState<State>({ goalId, thread: null, loading: true, sending: false, error: null });
  const scope = useMemo(() => ({ active: true, load: null as AbortController | null, send: null as AbortController | null, cancelReason: "" }), [goalId]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const changeRef = useRef(onDraftChange);
  changeRef.current = onDraftChange;
  const current = state.goalId === goalId ? state : { goalId, thread: null, loading: true, sending: false, error: null };
  const isCurrent = useCallback(() => scope.active && currentScope.current === scope, [scope]);
  const toError = (error: unknown): ErrorState => ({
    message: error instanceof api.ContextChatApiError ? error.message : "Не удалось выполнить запрос. Попробуйте ещё раз.",
    unauthorized: error instanceof api.ContextChatApiError && error.code === "unauthorized",
  });

  const refresh = useCallback(async () => {
    if (!isCurrent()) return;
    scope.load?.abort();
    const controller = new AbortController();
    scope.load = controller;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, CHAT_REQUEST_TIMEOUT_MS);
    setState((previous) => ({ goalId, thread: previous.goalId === goalId ? previous.thread : null, loading: true, sending: false, error: null }));
    try {
      const thread = await withSignal(api.getContextChat(goalId, controller.signal), controller.signal);
      if (isCurrent() && scope.load === controller && !controller.signal.aborted) setState({ goalId, thread, loading: false, sending: false, error: null });
    } catch (error) {
      if (isCurrent() && scope.load === controller) {
        setState((previous) => ({ ...previous, loading: false, error: toError(timedOut ? new api.ContextChatApiError("provider_timeout") : error) }));
      }
    } finally { clearTimeout(timer); }
  }, [goalId, isCurrent, scope]);

  useEffect(() => {
    scope.active = true;
    void refresh();
    return () => { scope.active = false; scope.load?.abort(); scope.send?.abort(); };
  }, [scope, refresh]);

  const edit = useCallback((text: string) => {
    if (!isCurrent() || scope.send) return;
    const next = { text, requestId: null };
    draftRef.current = next;
    changeRef.current(next);
    setState((previous) => ({ ...previous, error: null }));
  }, [isCurrent, scope]);

  const send = useCallback(async () => {
    const latest = draftRef.current;
    if (!isCurrent() || scope.send || current.loading || !current.thread || !latest.text.trim()) return;
    const submitted = { text: latest.text, requestId: latest.requestId ?? crypto.randomUUID() };
    draftRef.current = submitted;
    changeRef.current(submitted);
    const controller = new AbortController();
    scope.send = controller;
    scope.cancelReason = "";
    const timer = setTimeout(() => { scope.cancelReason = "timeout"; controller.abort(); }, CHAT_REQUEST_TIMEOUT_MS);
    setState((previous) => ({ ...previous, sending: true, error: null }));
    try {
      const thread = await withSignal(api.sendContextChat(goalId, { message: submitted.text.trim(), requestId: submitted.requestId }, controller.signal), controller.signal);
      if (!isCurrent() || controller.signal.aborted) return;
      setState({ goalId, thread, loading: false, sending: false, error: null });
      if (draftRef.current.text === submitted.text && draftRef.current.requestId === submitted.requestId) {
        draftRef.current = emptyChatDraft();
        changeRef.current(emptyChatDraft());
      }
    } catch (error) {
      if (isCurrent()) {
        const failure = scope.cancelReason === "timeout" ? new api.ContextChatApiError("provider_timeout") : error;
        setState((previous) => ({ ...previous, sending: false, error: scope.cancelReason === "user"
          ? { message: "Запрос остановлен. Сообщение осталось в поле — его можно отправить снова.", unauthorized: false }
          : toError(failure) }));
      }
    } finally {
      clearTimeout(timer);
      if (scope.send === controller) scope.send = null;
    }
  }, [current.loading, current.thread, goalId, isCurrent, scope]);

  const cancel = useCallback(() => { scope.cancelReason = "user"; scope.send?.abort(); }, [scope]);
  return { ...current, edit, send, cancel, refresh };
}
