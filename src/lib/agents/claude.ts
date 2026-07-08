import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export interface ExecuteAgentParams {
  agentInstructions: string
  userQuery: string
  maxTokens?: number
  temperature?: number
}

export interface ExecuteAgentResponse {
  response: string
  tokensUsed: number
}

export async function executeAgent({
  agentInstructions,
  userQuery,
  maxTokens = 1000,
  temperature = 0.7,
}: ExecuteAgentParams): Promise<ExecuteAgentResponse> {
  try {
    const message = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: maxTokens,
      temperature,
      system: agentInstructions,
      messages: [
        {
          role: "user",
          content: userQuery,
        },
      ],
    })

    const textContent = message.content.find((c: any) => c.type === "text")
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from Claude")
    }

    return {
      response: textContent.text,
      tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
    }
  } catch (error) {
    console.error("[executeAgent error]", error)
    throw error
  }
}
