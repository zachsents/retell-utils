# retell-utils

Type-safe [Zod](https://zod.dev) schemas for [Retell AI](https://www.retellai.com/) API resources.

## Install

```bash
bun add retell-utils
```

## What's included

- **Call & chat schemas** with configurable analysis fields via factory functions (`createCallSchemas`, `createChatSchemas`)
- **Agent config schemas** for voice agents, chat agents, LLMs, and conversation flows
- **Transcript & message schemas** for voice call transcripts and chat messages
- **Webhook schemas** via `createWebhookSchemas`
- **Enums** for call status, disconnection reasons, sentiment, etc.
- **Phone validation** with E.164 format
- **Test case schemas** for Retell's agent testing
- **Pagination utility** for iterating Retell list endpoints

## Usage

```typescript
import {
  createCallSchemas,
  VoiceAgentResponseSchema,
  LlmResponseSchema,
} from "retell-utils"

// Create call schemas with custom analysis fields
const { CallSchema } = createCallSchemas({
  callAnalysis: { sentiment: z.string(), summary: z.string() },
})

// Validate an agent API response
const agent = VoiceAgentResponseSchema.parse(apiResponse)
```

Schemas use `.passthrough()` so they won't break when Retell adds new fields.

## License

MIT
