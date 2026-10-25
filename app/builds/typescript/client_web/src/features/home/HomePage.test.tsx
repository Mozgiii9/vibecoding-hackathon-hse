import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import HomePage from "./HomePage";

it("demonstrates confirmed actions separately from intentions without accessing an API", async () => {
  const user = userEvent.setup();
  const fetch = vi.spyOn(globalThis, "fetch");
  render(<BrowserRouter><HomePage /></BrowserRouter>);
  expect(screen.getByRole("button", { name: "Намерение" })).toHaveAttribute("aria-pressed", "true");
  expect(within(screen.getByRole("status")).getByText("0 / 1")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Подтвердить в примере" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Выполненное действие" }));
  await user.click(screen.getByRole("button", { name: "Подтвердить в примере" }));
  expect(within(screen.getByRole("status")).getByText("1 / 1")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Отменить в примере" }));
  expect(within(screen.getByRole("status")).getByText("0 / 1")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Подтвердить в примере" }));
  await user.click(screen.getByRole("button", { name: "Намерение" }));
  expect(within(screen.getByRole("status")).getByText("0 / 1")).toBeInTheDocument();
  expect(screen.getByText(/Ваши материалы и реальный прогресс не меняются/)).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockRestore();
});

it("offers real destinations and accessible FAQ disclosures", async () => {
  const user = userEvent.setup();
  render(<BrowserRouter><HomePage /></BrowserRouter>);
  expect(screen.getAllByRole("link", { name: "Открыть пространство" }).every((link) => link.getAttribute("href") === "/app")).toBe(true);
  expect(screen.getByRole("link", { name: "Чат с агентом" })).toHaveAttribute("href", "/chat");
  expect(screen.getByRole("link", { name: "Войти" })).toHaveAttribute("href", "/login");
  const summary = screen.getByText("Все данные обрабатываются на моём устройстве?");
  await user.click(summary);
  expect(summary.closest("details")).toHaveAttribute("open");
  expect(screen.getByText(/Заметки обрабатывает настроенный серверный провайдер/)).toBeVisible();
});
