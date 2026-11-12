// Automatic archiving of academies whose admin asked to cancel. 24 hours after
// the request the academy is archived: hidden from learners and staff, its data
// kept, restorable by a super admin from "Deleted academies". Any Stripe
// subscription still running is ended at the same moment.
import { Academies, type Academy } from "@/lib/queries";
import { stopStripeBilling } from "@/lib/billingCancel";
import { logIntegrationEvent } from "@/lib/integrationLog";
import { notifyPlatformOfArchive } from "@/lib/cancellationEmail";

export const ARCHIVE_DELAY_HOURS = 24;

export function archiveTimeFor(requestedAt: Date = new Date()): string {
  return new Date(requestedAt.getTime() + ARCHIVE_DELAY_HOURS * 60 * 60 * 1000).toISOString();
}

export async function archiveAcademyAfterCancellation(academy: Academy): Promise<boolean> {
  // Claim it first so two overlapping runs can't archive (and email) twice.
  if (!(await Academies.markArchived(academy.id))) return false;

  const billing = await stopStripeBilling(academy, "immediately");
  if (!billing.ok) {
    await logIntegrationEvent({
      kind: "stripe",
      level: "error",
      message: `Academy "${academy.slug}" was archived but its Stripe subscription could not be cancelled.`,
      detail: `${billing.error ?? "Unknown error"} — cancel the subscription for customer ${academy.stripe_customer_id} in the Stripe Dashboard so no further payments are taken.`,
    });
  }
  try {
    await notifyPlatformOfArchive(academy, billing.ok);
  } catch (err) {
    console.error(`[archive] email about archived academy ${academy.slug} failed:`, err);
  }
  return true;
}

/** Archives every cancelled academy whose 24 hours are up. Safe to call as often as you like. */
export async function archiveDueAcademies(): Promise<{ archived: string[] }> {
  const archived: string[] = [];
  for (const academy of await Academies.dueForArchive()) {
    try {
      if (await archiveAcademyAfterCancellation(academy)) archived.push(academy.slug);
    } catch (err) {
      console.error(`[archive] archiving academy ${academy.slug} failed:`, err);
    }
  }
  return { archived };
}
