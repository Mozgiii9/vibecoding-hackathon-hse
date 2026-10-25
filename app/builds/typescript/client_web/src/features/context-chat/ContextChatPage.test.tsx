import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContextChatPage from "./ContextChatPage";
import * as api from "./api";
import { CHAT_REQUEST_TIMEOUT_MS, emptyChatDraft } from "./useContextChat";
import { citation, reply, result, thread, userMessage } from "./test-fixtures";

vi.mock("./api", async (actual) => ({ ...await actual<typeof api>(), getContextChat: vi.fn(), sendContextChat: vi.fn() }));
const get = vi.mocked(api.getContextChat);
const send = vi.mocked(api.sendContextChat);
const back = vi.fn();
const logout = vi.fn();
function Harness({ goalId = "demo" }: { goalId?: string }) {
  const [draft, setDraft] = useState(emptyChatDraft);
  return <ContextChatPage goalId={goalId} draft={draft} onDraftChange={setDraft} onBack={back} onLogout={logout} />;
}
function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => { get.mockReset().mockResolvedValue(thread); send.mockReset(); back.mockReset(); logout.mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("sends once on Enter, shows waiting feedback, then exposes an actual audio citation", async () => {
  const user = userEvent.setup();
  const operation = pending<api.ContextChatResult>();
  send.mockReturnValue(operation.promise);
  render(<Harness />);
  const field = await screen.findByRole("textbox", { name: "Ваше сообщение" });
  await waitFor(() => expect(field).toBeEnabled());
  expect(screen.getByRole("button", { name: "Отправить сообщение" })).toBeDisabled();
  await user.type(field, "Что я уже сделал?{Enter}");
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][1]).toMatchObject({ message: "Что я уже сделал?", requestId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  expect(field).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Ищу ответ в вашем контексте");
  await act(async () => { operation.resolve(result); });
  expect(await screen.findByText(reply.text)).toBeVisible();
  expect(field).toHaveValue("");
  await user.click(screen.getByRole("button", { name: `Источник 1: ${citation.sourceTitle}` }));
  const source = screen.getByRole("region", { name: `Цитата: ${citation.sourceTitle}` });
  expect(within(source).getByText(citation.quote)).toBeVisible();
  expect(within(source).getByText("Фрагмент 0:04 – 0:09")).toBeVisible();
  expect(within(source).getByText("Расшифровка")).toBeVisible();
});

it("keeps draft and request ID on failure, then retries without duplicating a send", async () => {
  const user = userEvent.setup();
  send.mockRejectedValueOnce(new api.ContextChatApiError("provider_failed")).mockResolvedValueOnce(result);
  render(<Harness />);
  const field = screen.getByRole("textbox");
  await waitFor(() => expect(field).toBeEnabled());
  await user.type(field, "Что я уже сделал?");
  await user.click(screen.getByRole("button", { name: "Отправить сообщение" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Ваше сообщение сохранено");
  expect(field).toHaveValue("Что я уже сделал?");
  await user.click(screen.getByRole("button", { name: "Отправить сообщение снова" }));
  await screen.findByText(reply.text);
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1][1]).toEqual(send.mock.calls[0][1]);
  expect(within(screen.getByRole("list", { name: "Сообщения" })).getAllByRole("listitem")).toHaveLength(2);
});

it("starts a new request ID after an edit and respects Shift+Enter and IME composition", async () => {
  const user = userEvent.setup();
  send.mockRejectedValue(new api.ContextChatApiError("provider_failed"));
  render(<Harness />);
  const field = screen.getByRole("textbox");
  await waitFor(() => expect(field).toBeEnabled());
  await user.type(field, "Вопрос{Shift>}{Enter}{/Shift}ещё");
  fireEvent.compositionStart(field);
  fireEvent.keyDown(field, { key: "Enter", code: "Enter", isComposing: true, keyCode: 229 });
  expect(send).not.toHaveBeenCalled();
  fireEvent.compositionEnd(field);
  await user.click(screen.getByRole("button", { name: "Отправить сообщение" }));
  await screen.findByRole("alert");
  await user.type(field, " уточнение");
  await user.click(screen.getByRole("button", { name: "Отправить сообщение" }));
  await screen.findByRole("alert");
  expect(send.mock.calls[1][1].requestId).not.toBe(send.mock.calls[0][1].requestId);
  expect(send.mock.calls[0][1].message).toContain("\n");
});

it("explains missing context and an unsupported question without falling back to another agent", async () => {
  const user = userEvent.setup();
  get.mockResolvedValue({ messages: [], context: { goalTitle: null, sourceCount: 0, hasContext: false } });
  const insufficient = { ...reply, text: "В вашем контексте нет ответа на этот вопрос.", outcome: "insufficient_context" as const, citations: [] };
  send.mockResolvedValue({ messages: [userMessage, insufficient], context: { goalTitle: null, sourceCount: 0, hasContext: false }, reply: insufficient });
  render(<Harness />);
  await screen.findByText("Сначала — немного о вас");
  await user.click(screen.getByRole("button", { name: "Добавить контекст к цели" }));
  expect(back).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Какая у меня цель?" }));
  expect(send).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Отправить сообщение" }));
  expect(await screen.findByText(insufficient.text)).toBeVisible();
  expect(screen.queryByRole("button", { name: /Источник 1/ })).not.toBeInTheDocument();
  expect(send.mock.calls.every((call) => call[0] === "demo")).toBe(true);
});

it("renders hostile source text literally without images, links, scripts or HTML", async () => {
  const user = userEvent.setup();
  const quote = '<img src="https://bad.invalid/leak"> [click](https://bad.invalid) <script>alert(1)</script>';
  const unsafe = { ...reply, text: quote, citations: [{ ...citation, sourceTitle: "<script>source</script>", quote, textEnd: quote.length }] };
  get.mockResolvedValue({ ...thread, messages: [userMessage, unsafe] });
  const { container } = render(<Harness />);
  await user.click(await screen.findByRole("button", { name: "Источник 1: <script>source</script>" }));
  expect(screen.getByRole("region", { name: "Цитата: <script>source</script>" })).toHaveTextContent(quote);
  expect(container.querySelector("img, script, iframe, .cc-citation-detail a")).toBeNull();
});

it("cancels promptly, keeps the draft, and ignores a late result from a transport that ignored abort", async () => {
  const user = userEvent.setup();
  const operation = pending<api.ContextChatResult>();
  send.mockReturnValue(operation.promise);
  render(<Harness />);
  const field = screen.getByRole("textbox");
  await waitFor(() => expect(field).toBeEnabled());
  await user.type(field, "Не теряй вопрос{Enter}");
  await user.click(screen.getByRole("button", { name: "Остановить ответ" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Запрос остановлен");
  expect(send.mock.calls[0][2].aborted).toBe(true);
  expect(field).toHaveValue("Не теряй вопрос");
  await act(async () => { operation.resolve(result); });
  expect(screen.queryByText(reply.text)).not.toBeInTheDocument();
});

it("aborts pending requests on unmount and loads persisted server history when reopened", async () => {
  const user = userEvent.setup();
  const operation = pending<api.ContextChatResult>();
  send.mockReturnValue(operation.promise);
  const first = render(<Harness />);
  await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
  await user.type(screen.getByRole("textbox"), "Вопрос{Enter}");
  const signal = send.mock.calls[0][2];
  first.unmount();
  expect(signal.aborted).toBe(true);
  get.mockResolvedValue(result);
  render(<Harness />);
  expect(await screen.findByText(reply.text)).toBeVisible();
  expect(get).toHaveBeenCalledTimes(2);
  await act(async () => { operation.resolve({ ...result, reply: { ...reply, text: "Late response" } }); });
  expect(screen.queryByText("Late response")).not.toBeInTheDocument();
});

it("never displays a delayed history response from the previous goal", async () => {
  const old = pending<api.ContextChatThread>();
  get.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ ...thread, context: { ...thread.context, goalTitle: "Другая цель" } });
  const view = render(<Harness goalId="old-goal" />);
  const oldSignal = get.mock.calls[0][1];
  view.rerender(<Harness goalId="new-goal" />);
  await screen.findByText("Другая цель");
  expect(oldSignal.aborted).toBe(true);
  await act(async () => { old.resolve({ ...thread, messages: [{ ...reply, text: "Private old goal" }] }); });
  expect(screen.queryByText("Private old goal")).not.toBeInTheDocument();
});

it("bounds a stalled request and preserves the same retry draft", async () => {
  vi.useFakeTimers();
  send.mockReturnValue(new Promise(() => {}));
  render(<Harness />);
  await act(async () => {});
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Вопрос с таймаутом" } });
  fireEvent.click(screen.getByRole("button", { name: "Отправить сообщение" }));
  await act(async () => { vi.advanceTimersByTime(CHAT_REQUEST_TIMEOUT_MS + 1); });
  expect(screen.getByRole("alert")).toHaveTextContent("слишком много времени");
  expect(screen.getByRole("textbox")).toHaveValue("Вопрос с таймаутом");
  expect(send.mock.calls[0][2].aborted).toBe(true);
});
