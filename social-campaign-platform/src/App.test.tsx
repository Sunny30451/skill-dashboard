import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

describe("CampaignHub app", () => {
  it("rejects an invalid demo password", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      await screen.findByRole("button", {
        name: /mit demo-konto anmelden/i,
      }),
    );
    await user.clear(screen.getByLabelText("Passwort"));
    await user.type(screen.getByLabelText("Passwort"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Einloggen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/falsch/i);
    expect(localStorage.getItem("campaignhub-session")).toBeNull();
  });

  it("authenticates a demo account with its password", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      await screen.findByRole("button", {
        name: /mit demo-konto anmelden/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Einloggen" }));

    expect(
      await screen.findByRole("heading", {
        name: /willkommen zurück, admin user/i,
      }),
    ).toBeInTheDocument();
    expect(localStorage.getItem("campaignhub-session")).toBe("1");
  });

  it("redirects a non-admin away from the admin route", async () => {
    localStorage.setItem("campaignhub-session", "2");
    window.history.replaceState({}, "", "/admin");

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: /willkommen zurück, worker user/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Admin-Bereich" }),
    ).not.toBeInTheDocument();
  });

  it("keeps campaign management read-only for visitors", async () => {
    localStorage.setItem("campaignhub-session", "3");
    window.history.replaceState({}, "", "/campaigns");

    render(<App />);

    expect(await screen.findByText(/Kampagnen im Lesemodus/i)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Neue Kampagne" }),
    ).not.toBeInTheDocument();
  });

  it("registers a user and links a participant identity", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      (await screen.findAllByRole("button", { name: "Registrieren" }))[0]!,
    );
    const dialog = screen.getByRole("dialog", { name: "Konto erstellen" });
    const fields = within(dialog);
    await user.type(fields.getByLabelText("Name"), "New Collaborator");
    await user.type(fields.getByLabelText("E-Mail"), "new@example.com");
    await user.type(fields.getByLabelText("Passwort"), "strong-pass");
    await user.click(fields.getByRole("button", { name: "Konto erstellen" }));

    expect(
      await screen.findByRole("heading", {
        name: /willkommen zurück, new collaborator/i,
      }),
    ).toBeInTheDocument();
    await waitFor(() => {
      const persisted = JSON.parse(
        localStorage.getItem("campaignhub-data") ?? "null",
      ) as {
        state?: {
          users?: Array<{ id: string; email: string }>;
          participants?: Array<{ userId?: string }>;
        };
      } | null;
      const createdUser = persisted?.state?.users?.find(
        (candidate) => candidate.email === "new@example.com",
      );
      expect(createdUser).toBeDefined();
      expect(
        persisted?.state?.participants?.some(
          (participant) => participant.userId === createdUser?.id,
        ),
      ).toBe(true);
      expect(localStorage.getItem("campaignhub-session")).toBe(createdUser?.id);
    });
  });

  it("lets an admin-created user authenticate with the assigned password", async () => {
    const user = userEvent.setup();
    localStorage.setItem("campaignhub-session", "1");
    window.history.replaceState({}, "", "/admin");
    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "Benutzer" }));
    await user.click(screen.getByRole("button", { name: "Neuer Benutzer" }));
    const dialog = screen.getByRole("dialog", { name: "Benutzer anlegen" });
    const fields = within(dialog);
    await user.type(fields.getByLabelText(/Name/), "Managed User");
    await user.type(
      fields.getByLabelText(/E-Mail-Adresse/),
      "managed@example.com",
    );
    await user.type(
      fields.getByLabelText(/Initiales Passwort/),
      "managed-pass",
    );
    await user.click(fields.getByRole("button", { name: "Benutzer anlegen" }));
    expect(await screen.findByText("managed@example.com")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Logout" }));
    await user.click(
      await screen.findByRole("button", { name: /mit demo-konto anmelden/i }),
    );
    await user.clear(screen.getByLabelText("E-Mail"));
    await user.type(screen.getByLabelText("E-Mail"), "managed@example.com");
    await user.clear(screen.getByLabelText("Passwort"));
    await user.type(screen.getByLabelText("Passwort"), "managed-pass");
    await user.click(screen.getByRole("button", { name: "Einloggen" }));

    expect(
      await screen.findByRole("heading", {
        name: /willkommen zurück, managed user/i,
      }),
    ).toBeInTheDocument();
  });

  it("creates a campaign and persists it in the local demo store", async () => {
    const user = userEvent.setup();
    localStorage.setItem("campaignhub-session", "1");
    window.history.replaceState({}, "", "/campaigns");
    const view = render(<App />);

    await user.click(
      await screen.findByRole("button", { name: "Neue Kampagne" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Neue Kampagne" });
    const fields = within(dialog);
    const name = dialog.querySelector<HTMLInputElement>("#campaign-name");
    expect(name).not.toBeNull();
    await user.type(name!, "Test Campaign");
    const description = dialog.querySelector<HTMLTextAreaElement>(
      "#campaign-description",
    );
    expect(description).not.toBeNull();
    await user.type(description!, "A persisted integration test campaign");
    const startDate = dialog.querySelector<HTMLInputElement>(
      "#campaign-start-date",
    );
    const endDate =
      dialog.querySelector<HTMLInputElement>("#campaign-end-date");
    expect(startDate).not.toBeNull();
    expect(endDate).not.toBeNull();
    fireEvent.change(startDate!, { target: { value: "2026-09-01" } });
    fireEvent.change(endDate!, { target: { value: "2026-10-01" } });
    expect(name).toHaveValue("Test Campaign");
    expect(description).toHaveValue("A persisted integration test campaign");
    expect(startDate).toHaveValue("2026-09-01");
    expect(endDate).toHaveValue("2026-10-01");
    await user.click(fields.getByRole("button", { name: "Erstellen" }));

    const feedback = await screen.findByText(
      /Kampagne wurde erstellt|Bitte prüfe Name/,
    );
    expect(feedback).toHaveTextContent("Kampagne wurde erstellt.");

    expect(
      await screen.findByRole("heading", {
        name: "Test Campaign",
        level: 2,
      }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(localStorage.getItem("campaignhub-data")).toContain(
        "Test Campaign",
      ),
    );

    view.unmount();
    render(<App />);
    expect(
      await screen.findByRole("heading", {
        name: "Test Campaign",
        level: 2,
      }),
    ).toBeInTheDocument();
  });

  it("gets a real local-provider response when chatting with an agent", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model: "gemma3",
            content: "Lokale Ollama-Testantwort",
            promptTokens: 18,
            completionTokens: 5,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    localStorage.setItem("campaignhub-session", "1");
    window.history.replaceState({}, "", "/profile");
    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "Live-Chat" }));
    await user.click(
      screen.getByRole("button", { name: /content generator/i }),
    );
    await user.type(
      screen.getByLabelText(/nachricht an content generator/i),
      "Erstelle eine kurze Caption.",
    );
    await user.click(screen.getByRole("button", { name: "Nachricht senden" }));

    expect(await screen.findByText("Lokale Ollama-Testantwort")).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(
      "/api/ollama/chat",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
