// In-memory fake mirroring the real Zelle persistence contract for unit tests.

export function createFakeZelleServerDeps({ events = [], payments = [], aliases = [] } = {}) {
  const store = {
    events: events.map((e) => ({ ...e })),
    payments: payments.map((p) => ({ ...p })),
    aliases: aliases.map((a) => ({ ...a })),
  };
  let nextPaymentSeq = 1;
  let nextAliasSeq = 1;

  return {
    _store: store,
    async getEvent(eventId) {
      return store.events.find((e) => e.id === eventId) || null;
    },
    async getEventsByIds(landlordId, ids) {
      const set = new Set(ids);
      return store.events.filter((e) => e.landlord_id === landlordId && set.has(e.id));
    },
    async deleteLinkedPayments({ landlordId, eventId, paymentIds }) {
      const targetIds = new Set(paymentIds);
      const removed = [];
      store.payments = store.payments.filter((p) => {
        const match =
          targetIds.has(p.id) &&
          p.landlord_id === landlordId &&
          p.zelle_event_id === eventId;
        if (match) removed.push(p.id);
        return !match;
      });
      return removed;
    },
    async insertPayments(rows) {
      const inserted = rows.map((r) => ({ id: `pay-${nextPaymentSeq++}`, ...r }));
      store.payments.push(...inserted);
      return inserted;
    },
    async getPayment(paymentId) {
      return store.payments.find((p) => p.id === paymentId) || null;
    },
    async updatePayment(paymentId, patch) {
      const row = store.payments.find((p) => p.id === paymentId);
      if (!row) throw new Error(`payment ${paymentId} not found`);
      Object.assign(row, patch);
      return row;
    },
    async updateEvent(eventId, patch) {
      const row = store.events.find((e) => e.id === eventId);
      if (!row) throw new Error(`event ${eventId} not found`);
      Object.assign(row, patch);
      return row;
    },
    async upsertAlias(row) {
      const existing = store.aliases.find(
        (a) =>
          a.landlord_id === row.landlord_id &&
          a.payer_name_normalized === row.payer_name_normalized
      );
      if (existing) {
        Object.assign(existing, row);
        return existing;
      }
      const created = { id: `alias-${nextAliasSeq++}`, ...row };
      store.aliases.push(created);
      return created;
    },
    async deleteAlias(landlordId, aliasId) {
      const before = store.aliases.length;
      store.aliases = store.aliases.filter(
        (a) => !(a.id === aliasId && a.landlord_id === landlordId)
      );
      return before - store.aliases.length;
    },
  };
}

export function createFakeZelleClientAdapter({ events = [], payments = [] } = {}) {
  const deps = createFakeZelleServerDeps({ events, payments });
  return {
    _store: deps._store,
    undoEvent(eventId, landlordId = "landlord-1") {
      return import("./core.js").then((m) => m.undoZelleAutoPost(deps, { landlordId, eventId }));
    },
  };
}
