import { z } from "zod"

/** Validates an international E.164 phone number (`+` followed by 1–15 digits). */
export const E164PhoneSchema = z.string().regex(/^\+[1-9]\d{1,14}$/)

/**
 * E.164 phone number or null. Invalid, empty, or missing numbers are caught as
 * null — useful for `from_number` where caller ID may be unavailable.
 */
export const e164OrNullSchema = E164PhoneSchema.nullable().catch(null)
