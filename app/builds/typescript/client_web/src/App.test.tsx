import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";

import { __resetAuthAdapterForTests } from "@/api/auth-adapter";

import App from "./App";

vi.mock("@/features/goals/GoalsPage", () => ({
  default: ({ onOpenAssistant }: { onOpenAssistant: () => void }) => <main>Goal workspace<button onClick={onOpenAssistant}>Чат с агентом</button></main>,
}));
vi.mock("@/features/context-chat/api", async (actual) => ({
  ...await actual<typeof import("@/features/context-chat/api")>(),
  getContextChat: vi.fn(async () => ({ messages: [], context: { goalTitle: "Моя цель", sourceCount: 0, hasContext: true } })),
}));

let restoreSessionOnLoad = false;

function renderApp() {
  return render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}

describe("App", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    restoreSessionOnLoad = false;
    __resetAuthAdapterForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const requestUrl = typeof input === "string" ? input : input.toString();
        if (requestUrl.includes("/api/auth/bootstrap-status")) {
          return new Response(
            JSON.stringify({
              account_initialized: true,
              mode: "local",
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            }
          );
        }

        if (requestUrl.includes("/api/auth/refresh")) {
          if (restoreSessionOnLoad) return new Response(JSON.stringify({ access_token: "restored-test-token", token_type: "Bearer", expires_at: "2099-01-01T00:00:00Z" }), { status: 200, headers: { "content-type": "application/json" } });
          return new Response(JSON.stringify({ error: "invalid_refresh_token" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        if (requestUrl.includes("/api/auth/login")) {
          return new Response(
            JSON.stringify({
              access_token: "test-access-token",
              token_type: "Bearer",
              expires_at: "2099-01-01T00:00:00.000Z",
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            }
          );
        }

        if (requestUrl.includes("/api/session")) {
          return new Response(
            JSON.stringify({
              mode: "local",
              user: {
                id: "owner",
                name: "Owner",
                initials: "OW",
                email: "owner@local.paa",
                role: "owner",
              },
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            }
          );
        }

        return new Response(
          JSON.stringify({
            onboarding_required: false,
            active_provider_profile: null,
            default_provider_profile: null,
            providers: [],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows login screen on first load", async () => {
    renderApp();

    expect(await screen.findByText("Вернёмся к вашей цели")).toBeInTheDocument();
    expect(screen.getByLabelText("Имя пользователя")).toBeInTheDocument();
    expect(screen.getByLabelText("Пароль")).toBeInTheDocument();
  });

  it("navigates to main interface after login", async () => {
    const user = userEvent.setup();

    renderApp();

    await user.type(await screen.findByLabelText("Имя пользователя"), "testuser");
    await user.type(screen.getByLabelText("Пароль"), "password123");
    await user.click(screen.getByRole("button", { name: "Войти" }));

    expect(await screen.findByText("Goal workspace")).toBeInTheDocument();
  });

  it("opens only context chat and preserves an unsent draft across the goals round trip", async () => {
    restoreSessionOnLoad = true;
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("button", { name: "Чат с агентом" }));
    expect(window.location.pathname).toBe("/chat");
    expect(screen.getByRole("heading", { name: "Чат с агентом" })).toBeVisible();
    const field = screen.getByRole("textbox", { name: "Ваше сообщение" });
    await waitFor(() => expect(field).toBeEnabled());
    await user.type(field, "Мой неотправленный вопрос");
    await user.click(screen.getByRole("button", { name: "К моей цели" }));
    await user.click(screen.getByRole("button", { name: "Чат с агентом" }));
    expect(screen.getByRole("textbox")).toHaveValue("Мой неотправленный вопрос");
    expect(screen.queryByPlaceholderText("Message your BrainDrive...")).not.toBeInTheDocument();
  });

  it("restores the context-chat deep link after a valid session reload", async () => {
    restoreSessionOnLoad = true;
    window.history.replaceState({}, "", "/chat");
    renderApp();
    expect(await screen.findByRole("heading", { name: "Чат с агентом" })).toBeVisible();
    expect(screen.queryByText("Goal workspace")).not.toBeInTheDocument();
  });

  it("clears the private in-memory draft on logout before another session enters chat", async () => {
    restoreSessionOnLoad = true;
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("button", { name: "Чат с агентом" }));
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
    await user.type(screen.getByRole("textbox"), "Private unsent question");
    restoreSessionOnLoad = false;
    await user.click(screen.getByRole("button", { name: "Выйти" }));
    await user.type(await screen.findByLabelText("Имя пользователя"), "another-session");
    await user.type(screen.getByLabelText("Пароль"), "password123");
    await user.click(screen.getByRole("button", { name: "Войти" }));
    await user.click(await screen.findByRole("button", { name: "Чат с агентом" }));
    expect(screen.getByRole("textbox")).toHaveValue("");
  });
});
