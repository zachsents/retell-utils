import { z } from "zod"

/** Weighted agent entry used in phone number inbound/outbound lists. */
export const PhoneNumberAgentEntrySchema = z.object({
  agent_id: z.string(),
  agent_version: z.number().optional(),
  weight: z.number(),
})

/** Zod schema for a phone number response from the Retell API. */
export const PhoneNumberResponseSchema = z.object({
  phone_number: z.string(),
  phone_number_type: z
    .enum(["retell-twilio", "retell-telnyx", "custom"])
    .optional(),
  nickname: z.string().nullable().optional(),
  last_modification_timestamp: z.number(),
  inbound_agents: z.array(PhoneNumberAgentEntrySchema).nullable().optional(),
  outbound_agents: z.array(PhoneNumberAgentEntrySchema).nullable().optional(),
  inbound_sms_agents: z
    .array(PhoneNumberAgentEntrySchema)
    .nullable()
    .optional(),
  outbound_sms_agents: z
    .array(PhoneNumberAgentEntrySchema)
    .nullable()
    .optional(),
})
