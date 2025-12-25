// mpesa/mpesaUtils.js
import crypto from "crypto";

export function makeIdempotencyKey(...parts) {
  return crypto
    .createHash("sha256")
    .update(parts.join("|"))
    .digest("hex");
}

export function normalizeMsisdn(msisdn) {
  if (msisdn.startsWith("0")) return `254${msisdn.slice(1)}`;
  if (msisdn.startsWith("7")) return `254${msisdn}`;
  return msisdn;
}

export function journalId(prefix, ref) {
  return crypto
    .createHash("sha1")
    .update(`${prefix}|${ref}`)
    .digest("hex");
}
