import { z } from "zod"
import { parsePhoneNumberFromString } from "libphonenumber-js"

/**
 * Validates and normalizes a phone number to E.164 format (`+` followed by 1–15
 * digits).
 */
export const e164PhoneSchema = z
  .string()
  .transform((v) => parsePhoneNumberFromString(v, "US")?.format("E.164"))
  .pipe(z.string().regex(/^\+[1-9]\d{1,14}$/))

/**
 * E.164 phone number or null. Invalid, empty, or missing numbers are caught as
 * null — useful for `from_number` where caller ID may be unavailable.
 */
export const e164OrNullSchema = e164PhoneSchema.nullable().catch(null)
