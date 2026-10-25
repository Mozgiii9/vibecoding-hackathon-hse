import { authenticatedFetch } from "../../api/auth-adapter";
import { ContextChatApiError, getContextChat, sendContextChat } from "./api";
import { result, thread } from "./test-fixtures";

vi.mock("../../api/auth-adapter", () => ({ authenticatedFetch: vi.fn() }));
const fetch = vi.mocked(authenticatedFetch);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const input = { message: "Что я уже сделал?", requestId: "36fae39f-88bb-442a-887c-21a6ea2e87dd" };
beforeEach(() => fetch.mockReset());

it("uses only the authenticated goal-scoped chat endpoint and the exact request ID", async () => {
  const controller = new AbortController();
  fetch.mockResolvedValueOnce(json(thread)).mockResolvedValueOnce(json(result));
  expect(await getContextChat("goal / one", controller.signal)).toEqual(thread);
  expect(await sendContextChat("goal / one", input, controller.signal)).toEqual(result);
  expect(fetch.mock.calls.map((call) => call[0])).toEqual(["/api/goals/goal%20%2F%20one/chat", "/api/goals/goal%20%2F%20one/chat"]);
  expect(fetch.mock.calls[1][1]).toMatchObject({ method: "POST", signal: controller.signal, body: JSON.stringify(input) });
});

it.each([401, 403])("keeps auth failure %s clear even when a proxy sends HTML", async (status) => {
  fetch.mockResolvedValue(new Response("<html>private proxy diagnostics</html>", { status }));
  await expect(getContextChat("demo", new AbortController().signal)).rejects.toMatchObject({ code: status === 401 ? "unauthorized" : "forbidden" });
});

it("shows a safe actionable error without upstream messages", async () => {
  fetch.mockResolvedValue(json({ error: { code: "provider_failed", message: "private provider diagnostics" } }, 502));
  await expect(sendContextChat("demo", input, new AbortController().signal)).rejects.toThrow("Ваше сообщение сохранено");
});

it("rejects unsupported grounded answers and orphan replies", async () => {
  fetch.mockResolvedValueOnce(json({ ...result, messages: [{ ...result.reply, citations: [] }] }));
  await expect(sendContextChat("demo", input, new AbortController().signal)).rejects.toMatchObject({ code: "invalid_response" });
  fetch.mockResolvedValueOnce(json({ ...result, messages: [] }));
  await expect(sendContextChat("demo", input, new AbortController().signal)).rejects.toMatchObject({ code: "invalid_response" });
});

it("does not send blank or oversized messages", async () => {
  await expect(sendContextChat("demo", { ...input, message: " " }, new AbortController().signal)).rejects.toBeInstanceOf(ContextChatApiError);
  await expect(sendContextChat("demo", { ...input, message: "a".repeat(4001) }, new AbortController().signal)).rejects.toBeInstanceOf(ContextChatApiError);
  expect(fetch).not.toHaveBeenCalled();
});
