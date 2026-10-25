import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import AuthFlow from "./AuthFlow";

const fetchBootstrapStatusMock = vi.fn();
const restoreSessionMock = vi.fn();
const loginMock = vi.fn();
const signupMock = vi.fn();

vi.mock("@/api/auth-adapter", () => ({
  fetchBootstrapStatus: () => fetchBootstrapStatusMock(),
  restoreSession: () => restoreSessionMock(),
  login: (payload: { identifier: string; password: string }) => loginMock(payload),
  signup: (payload: { identifier: string; password: string }) => signupMock(payload),
}));

describe("AuthFlow", () => {
  beforeEach(() => {
    fetchBootstrapStatusMock.mockReset();
    restoreSessionMock.mockReset();
    loginMock.mockReset();
    signupMock.mockReset();

    restoreSessionMock.mockResolvedValue(false);
    loginMock.mockResolvedValue(undefined);
    signupMock.mockResolvedValue(undefined);
  });

  it("hides create-account CTA when account is initialized", async () => {
    fetchBootstrapStatusMock.mockResolvedValue({
      account_initialized: true,
      mode: "local",
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthFlow mode="local" onAuthenticated={() => {}} />
      </MemoryRouter>
    );

    expect(await screen.findByText("Вернёмся к вашей цели")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Создать аккаунт" })).not.toBeInTheDocument();
  });

  it("defaults to signup on first load before account initialization", async () => {
    fetchBootstrapStatusMock.mockResolvedValue({
      account_initialized: false,
      mode: "local",
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthFlow mode="local" onAuthenticated={() => {}} />
      </MemoryRouter>
    );

    expect(await screen.findByText("Создайте вход в своё пространство")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Создать аккаунт" })).toBeInTheDocument();
  });

  it("redirects /signup to login when account is initialized", async () => {
    fetchBootstrapStatusMock.mockResolvedValue({
      account_initialized: true,
      mode: "local",
    });

    render(
      <MemoryRouter initialEntries={["/signup"]}>
        <AuthFlow mode="local" onAuthenticated={() => {}} />
      </MemoryRouter>
    );

    expect(await screen.findByText("Вернёмся к вашей цели")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Аккаунт уже создан. Войдите с вашим именем и паролем.")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Создать аккаунт" })).not.toBeInTheDocument();
  });

  it("allows signup route before account initialization", async () => {
    fetchBootstrapStatusMock.mockResolvedValue({
      account_initialized: false,
      mode: "local",
    });

    render(
      <MemoryRouter initialEntries={["/signup"]}>
        <AuthFlow mode="local" onAuthenticated={() => {}} />
      </MemoryRouter>
    );

    expect(await screen.findByText("Создайте вход в своё пространство")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Создать аккаунт" })).toBeInTheDocument();
  });

  it("creates the first account and opens the workspace", async () => {
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    fetchBootstrapStatusMock.mockResolvedValue({ account_initialized: false, mode: "local" });
    render(<MemoryRouter><AuthFlow mode="local" onAuthenticated={onAuthenticated} /></MemoryRouter>);

    await user.type(await screen.findByLabelText("Имя пользователя"), " owner ");
    await user.type(screen.getByLabelText("Пароль"), "password123");
    await user.type(screen.getByLabelText("Повторите пароль"), "password123");
    expect(screen.getByLabelText("Пароль")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.queryByRole("button", { name: "Войти" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Создать аккаунт" }));

    expect(signupMock).toHaveBeenCalledWith({ identifier: "owner", password: "password123" });
    expect(onAuthenticated).toHaveBeenCalledOnce();
  });

  it("retries bootstrap after a connection failure", async () => {
    const user = userEvent.setup();
    fetchBootstrapStatusMock.mockRejectedValueOnce(new Error("offline"));
    fetchBootstrapStatusMock.mockResolvedValueOnce({ account_initialized: false, mode: "local" });
    render(<MemoryRouter initialEntries={["/signup"]}><AuthFlow mode="local" onAuthenticated={() => {}} /></MemoryRouter>);

    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось подключиться к приложению");
    await user.click(screen.getByRole("button", { name: "Повторить подключение" }));
    expect(await screen.findByRole("button", { name: "Создать аккаунт" })).toBeInTheDocument();
    expect(fetchBootstrapStatusMock).toHaveBeenCalledTimes(2);
  });

  it("uses the server-selected local-owner flow without password login", async () => {
    const onAuthenticated = vi.fn();
    fetchBootstrapStatusMock.mockResolvedValue({ account_initialized: true, mode: "local-owner" });
    render(<MemoryRouter><AuthFlow mode="local" onAuthenticated={onAuthenticated} /></MemoryRouter>);

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledOnce());
    expect(loginMock).not.toHaveBeenCalled();
    expect(restoreSessionMock).not.toHaveBeenCalled();
  });

  it("translates failed sign-in and preserves the entered credentials", async () => {
    const user = userEvent.setup();
    fetchBootstrapStatusMock.mockResolvedValue({ account_initialized: true, mode: "local" });
    loginMock.mockRejectedValue(new Error("Invalid username or password."));
    render(<MemoryRouter><AuthFlow mode="local" onAuthenticated={() => {}} /></MemoryRouter>);

    await user.type(await screen.findByLabelText("Имя пользователя"), "owner");
    await user.type(screen.getByLabelText("Пароль"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Войти" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Неверное имя пользователя или пароль");
    expect(screen.getByLabelText("Имя пользователя")).toHaveValue("owner");
    expect(screen.getByLabelText("Пароль")).toHaveAttribute("autocomplete", "current-password");
  });

  it("explains recovery without promising an email reset", async () => {
    const user = userEvent.setup();
    fetchBootstrapStatusMock.mockResolvedValue({ account_initialized: true, mode: "local" });
    render(<MemoryRouter><AuthFlow mode="local" onAuthenticated={() => {}} /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Забыли пароль?" }));
    expect(screen.getByRole("heading", { name: "Обратитесь к администратору" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Получить инструкции" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Вернуться ко входу" }));
    expect(screen.getByRole("button", { name: "Войти" })).toBeInTheDocument();
  });
});
