#!/usr/bin/env node
// Provision or inspect a high-entropy zelle_inbound_token for a landlord team.
// Dry-run by default; pass --apply to persist the generated token.
//
// Usage:
//   node scripts/provision-zelle-token.mjs --landlord-id <uuid> [--domain mail.example.com] [--apply]

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function parseArgs(argv) {
  const args = { landlordId: null, domain: "mail.keyturn.app", apply: false, rotate: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--landlord-id") args.landlordId = argv[++i];
    else if (a === "--domain") args.domain = argv[++i];
    else if (a === "--apply") args.apply = true;
    else if (a === "--rotate") args.rotate = true;
  }
  return args;
}

async function main() {
  const { landlordId, domain, apply, rotate } = parseArgs(process.argv);
  if (!landlordId) {
    console.error("Usage: node scripts/provision-zelle-token.mjs --landlord-id <uuid> [--domain <resend-domain>] [--apply] [--rotate]");
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profile, error } = await supabase
    .from("landlord_profiles")
    .select("id, email, zelle_inbound_token")
    .eq("id", landlordId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!profile) {
    console.error(`Landlord profile not found: ${landlordId}`);
    process.exit(1);
  }

  if (profile.zelle_inbound_token && !rotate) {
    console.log(`Existing token found for ${profile.email || landlordId}.`);
    console.log(`Inbound address: zelle+${profile.zelle_inbound_token}@${domain}`);
    console.log("Pass --rotate --apply to replace it.");
    return;
  }

  const nextToken = `zt_${crypto.randomBytes(18).toString("base64url")}`;
  if (!apply) {
    console.log(`[DRY RUN] Would set zelle_inbound_token for ${profile.email || landlordId}.`);
    console.log(`[DRY RUN] Preview address: zelle+${nextToken}@${domain}`);
    console.log("Re-run with --apply to write this token to Supabase.");
    return;
  }

  const { error: updError } = await supabase
    .from("landlord_profiles")
    .update({ zelle_inbound_token: nextToken })
    .eq("id", landlordId);
  if (updError) throw new Error(updError.message);

  console.log(`Provisioned zelle_inbound_token for ${profile.email || landlordId}.`);
  console.log(`Private forwarding address: zelle+${nextToken}@${domain}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
