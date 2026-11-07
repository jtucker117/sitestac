// Supabase Edge Function: grok-lead-ingest
// Webhook for Grok Bot to push leads from Google or Facebook into the Relay leads board.
//
// Deploy:  supabase functions deploy grok-lead-ingest   (Verify JWT: OFF — uses shared secret)
// Secrets: supabase secrets set GROK_INGEST_SECRET=your-long-random-string
//
// POST body (single lead or batch):
// {
//   "platform": "google" | "facebook",   // required — sets source to grok_google / grok_facebook
//   "leads": [
//     {
//       "id": "optional-stable-id",
//       "name": "Business name",          // required
//       "category": "Roofing",
//       "area": "Conroe",
//       "state": "TX",
//       "phone": "555-123-4567",
//       "address": "123 Main St",
//       "zip": "77301",
//       "website": "https://...",
//       "rating": 4.5,
//       "reviews": 42,
//       "lat": 30.3,
//       "lng": -95.4,
//       "place_id": "ChIJ...",
//       "notes": "Found via Grok search",
//       "socials": [{ "platform": "facebook", "url": "https://facebook.com/..." }]
//     }
//   ]
// }
//
// Auth: header `x-grok-secret: <GROK_INGEST_SECRET>` must match the secret.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-grok-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUILD = "2026-09-01a";

type Platform = "google" | "facebook";
type LeadSource = "grok_google" | "grok_facebook";

interface IngestLead {
  id?: string;
  name: string;
  category?: string | null;
  area?: string | null;
  state?: string | null;
  phone?: string | null;
  address?: string | null;
  zip?: string | null;
  website?: string | null;
  rating?: number | null;
  reviews?: number | null;
  lat?: number | null;
  lng?: number | null;
  place_id?: string | null;
  notes?: string | null;
  socials?: { platform: string; url: string }[] | null;
  site_verdict?: string | null;
  site_reason?: string | null;
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);

const sourceForPlatform = (platform: Platform): LeadSource =>
  platform === "facebook" ? "grok_facebook" : "grok_google";

const makeId = (lead: IngestLead, platform: Platform) => {
  if (lead.id?.trim()) return lead.id.trim();
  if (lead.place_id?.trim()) return lead.place_id.trim();
  const bits = [platform, lead.name, lead.zip ?? lead.area ?? ""].filter(Boolean).join("-");
  return `grok-${slug(bits)}-${crypto.randomUUID().slice(0, 8)}`;
};

const normalize = (lead: IngestLead, platform: Platform) => {
  const name = String(lead.name ?? "").trim();
  if (!name) return null;
  const website = lead.website?.trim() || null;
  const siteVerdict = lead.site_verdict?.trim() || (!website ? "none" : null);
  return {
    id: makeId(lead, platform),
    place_id: lead.place_id?.trim() || null,
    name,
    category: lead.category?.trim() || null,
    area: lead.area?.trim() || null,
    state: lead.state?.trim()?.toUpperCase() || null,
    phone: lead.phone?.trim() || null,
    address: lead.address?.trim() || null,
    zip: lead.zip?.trim() || null,
    rating: lead.rating ?? null,
    reviews: lead.reviews ?? 0,
    website,
    site_verdict: siteVerdict,
    site_reason: lead.site_reason?.trim() || (siteVerdict === "none" ? "No website at all" : null),
    socials: Array.isArray(lead.socials) ? lead.socials.filter((s) => s?.url) : [],
    lat: lead.lat ?? null,
    lng: lead.lng ?? null,
    source: sourceForPlatform(platform),
    status: "new" as const,
    web_status: website ? "likely" as const : "confirmed" as const,
    notes: lead.notes?.trim() || null,
  };
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const secret = Deno.env.get("GROK_INGEST_SECRET");
    if (!secret) throw new Error("GROK_INGEST_SECRET is not configured on this function.");
    const provided = req.headers.get("x-grok-secret") ?? "";
    if (provided !== secret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const payload = await req.json();
    const platform = String(payload?.platform ?? "").trim().toLowerCase() as Platform;
    if (platform !== "google" && platform !== "facebook") {
      throw new Error('Missing or invalid "platform" — use "google" or "facebook".');
    }

    const raw: IngestLead[] = Array.isArray(payload?.leads)
      ? payload.leads
      : payload?.name
        ? [payload as IngestLead]
        : [];
    if (!raw.length) throw new Error('No leads provided — send "leads": [...] or a single lead object.');

    const rows = raw.map((l) => normalize(l, platform)).filter(Boolean);
    if (!rows.length) throw new Error("Every lead must include a non-empty name.");

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("leads")
      .upsert(rows, { onConflict: "id" })
      .select("id, name, source");

    if (error) throw error;

    return new Response(JSON.stringify({
      ok: true,
      build: BUILD,
      platform,
      source: sourceForPlatform(platform),
      count: data?.length ?? rows.length,
      leads: data ?? rows.map((r) => ({ id: r!.id, name: r!.name, source: r!.source })),
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ingest failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
