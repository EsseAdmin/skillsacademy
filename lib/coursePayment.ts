// Course payments are handled OUTSIDE the platform. An academy that wants to charge sets an optional price (shown to
// learners) and/or a payment link (its own website or payment system) on the course. Learners can't enrol themselves
// in such a course: they follow the link, pay there, and the academy then enrols them (People -> add learner).
import { safeHttpUrl } from "@/lib/safeUrl";

/** True when the academy charges for this course (a price shown, or a payment link set). */
export function courseNeedsPayment(course: { price_pence: number; payment_url?: string | null }): boolean {
  return course.price_pence > 0 || !!course.payment_url;
}

/** A valid https payment link from form input, or null when empty. `invalid` is true when something was typed but isn't usable. */
export function parsePaymentUrl(raw: FormDataEntryValue | null): { url: string | null; invalid: boolean } {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return { url: null, invalid: false };
  const url = safeHttpUrl(v, { httpsOnly: true });
  return url ? { url, invalid: false } : { url: null, invalid: true };
}
