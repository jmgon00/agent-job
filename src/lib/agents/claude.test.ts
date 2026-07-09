// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest"
import { z } from "zod"

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate }
  },
}))

import { executeStructuredAgent } from "./claude"

const schema = z.object({ headline: z.string(), summary: z.string() })

beforeEach(() => {
  mockCreate.mockReset()
})

describe("executeStructuredAgent", () => {
  it("parses and validates a JSON response against the schema", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: "text", text: '{"headline":"Dev Senior","summary":"5 anios de experiencia."}' },
      ],
    })

    const result = await executeStructuredAgent({
      agentInstructions: "system prompt",
      userQuery: "raw profile text",
      schema,
    })

    expect(result).toEqual({
      headline: "Dev Senior",
      summary: "5 anios de experiencia.",
    })
  })

  it("throws when Claude does not return valid JSON", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "not json at all" }],
    })

    await expect(
      executeStructuredAgent({
        agentInstructions: "system prompt",
        userQuery: "raw profile text",
        schema,
      })
    ).rejects.toThrow()
  })

  it("throws when the JSON does not match the schema", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"headline":"Dev Senior"}' }],
    })

    await expect(
      executeStructuredAgent({
        agentInstructions: "system prompt",
        userQuery: "raw profile text",
        schema,
      })
    ).rejects.toThrow()
  })
})
