// Real browser persistence adapter for Zelle Inbox mutations.
// All mutations go through authenticated Next.js API routes so payment deletes
// and multi-row writes stay atomic and server-authorized.

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export function createZelleAdapter() {
  return {
    undoEvent(eventId) {
      return postJson("/api/zelle/undo", { eventId });
    },
  };
}
