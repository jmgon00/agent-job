import { describe, it, expect } from "vitest";
import { emailSchema } from "./validators";

describe("emailSchema", () => {
  it("accepts a valid email", () => {
    const result = emailSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(true);
  });

  it("rejects a string with no @", () => {
    const result = emailSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = emailSchema.safeParse({ email: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing email field", () => {
    const result = emailSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
