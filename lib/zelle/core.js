// Zelle mutation core (React-free, adapter-injected).
// Houses both the server-side Undo / triage invariants and the thin client
// operations consumed by useZelleMutations().

/**
 * Server-side Undo for an auto_posted Zelle event.
 * - Safe & idempotent: if already undone to needs_review with no posted payments,
 *   returns ok with removedPaymentIds: [].
 * - Deletes ONLY payment rows listed in posted_payment_ids that belong to the
 *   same landlord team AND carry zelle_event_id === eventId.
 */
export async function undoZelleAutoPost(deps, { landlordId, eventId }) {
  if (!landlordId) throw new Error("undoZelleAutoPost: landlordId is required");
  if (!eventId) throw new Error("undoZelleAutoPost: eventId is required");

  const event = await deps.getEvent(eventId);
  if (!event) {
    const err = new Error("Zelle event not found.");
    err.status = 404;
    throw err;
  }
  if (event.landlord_id !== landlordId) {
    const err = new Error("You do not have access to this Zelle event.");
    err.status = 403;
    throw err;
  }

  const postedIds = Array.isArray(event.posted_payment_ids)
    ? event.posted_payment_ids.filter(Boolean)
    : [];

  // Idempotent replay when already undone by a double-click or retry.
  if (event.status === "needs_review" && postedIds.length === 0 && event.match_reason === "undone_by_landlord") {
    return { event, removedPaymentIds: [], alreadyUndone: true };
  }

  if (event.status !== "auto_posted") {
    const err = new Error(`Only auto-posted events can be undone (current status: ${event.status}).`);
    err.status = 409;
    throw err;
  }

  let removedPaymentIds = [];
  if (postedIds.length > 0) {
    removedPaymentIds = await deps.deleteLinkedPayments({
      landlordId,
      eventId,
      paymentIds: postedIds,
    });
  }

  const updated = await deps.updateEvent(eventId, {
    status: "needs_review",
    match_reason: "undone_by_landlord",
    posted_payment_ids: [],
    resolved_at: null,
    resolved_by: null,
  });

  return { event: updated, removedPaymentIds, alreadyUndone: false };
}

/**
 * Client-side mutation: undo an auto-posted Zelle event via the server route.
 */
export async function undoZelleEvent(adapter, eventId) {
  if (!eventId) throw new Error("undoZelleEvent: eventId is required");
  return adapter.undoEvent(eventId);
}
