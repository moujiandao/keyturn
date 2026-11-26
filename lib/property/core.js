// Property writes that the client makes directly (create, delete, drive-link).
// Edit + image-upload are landlord actions already behind server routes and stay
// there; this slice covers the scattered direct client writes. React-free,
// adapter-injected.

// Create a property for a landlord. Coerces units to a number, matching the
// prior inline behavior (`+form.units`). inProduction defaults true — the DB
// column default would do the same, but writing it explicitly keeps the
// behavior testable and visible here rather than implicit in the schema.
export async function createProperty(adapter, { landlordId, address, city, state, zip, units, type, status, inProduction }) {
  await adapter.insertProperty({
    landlord_id: landlordId,
    address, city, state, zip,
    units: Number(units),
    type, status,
    in_production: inProduction !== false,
  });
}

// Delete a property by id.
export async function deleteProperty(adapter, id) {
  await adapter.deleteProperty(id);
}

// Set (or clear) a property's Google Drive link. Trims; empty -> null. Returns
// the stored value (trimmed string or null).
export async function setDriveLink(adapter, id, link) {
  const value = (link || "").trim() || null;
  await adapter.updateProperty(id, { drive_link: value });
  return value;
}

// Parse an optional Max AGA percentage (0 to 100). Empty/nullish clears to null.
// Accepts decimals like "3.5", ".5", "3.", or "3.5%" and rejects "%", negatives, > 100, or junk.
export function parseMaxAgaPercent(rawValue) {
  if (rawValue === null || rawValue === undefined) return null;
  let num;
  if (typeof rawValue === "number") {
    num = rawValue;
  } else if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (trimmed === "") return null;
    const cleaned = trimmed.replace(/%$/, "").trim();
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(cleaned)) {
      throw new RangeError("Max AGA must be a percentage between 0 and 100.");
    }
    num = Number(cleaned);
  } else {
    throw new RangeError("Max AGA must be a percentage between 0 and 100.");
  }
  if (!Number.isFinite(num) || num < 0 || num > 100) {
    throw new RangeError("Max AGA must be a percentage between 0 and 100.");
  }
  return num === 0 ? 0 : num;
}

// Set (or clear) a property's upcoming-year Max AGA percentage.
export async function setMaxAgaPercent(adapter, id, rawValue) {
  const value = parseMaxAgaPercent(rawValue);
  await adapter.updateProperty(id, { max_aga_percent: value });
  return value;
}
