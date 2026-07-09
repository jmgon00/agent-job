import { describe, it, expect, beforeEach } from "vitest";
import { getStoredUser, setStoredUser, clearStoredUser } from "./auth-storage";

describe("auth-storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when nothing is stored", () => {
    expect(getStoredUser()).toBeNull();
  });

  it("stores and retrieves a user", () => {
    setStoredUser({ id: "abc123", email: "user@example.com" });
    expect(getStoredUser()).toEqual({ id: "abc123", email: "user@example.com" });
  });

  it("returns null after clearing", () => {
    setStoredUser({ id: "abc123", email: "user@example.com" });
    clearStoredUser();
    expect(getStoredUser()).toBeNull();
  });

  it("returns null if only the id is present without an email", () => {
    localStorage.setItem("agentjob_user_id", "abc123");
    expect(getStoredUser()).toBeNull();
  });
});
