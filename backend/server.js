import express from "express";
import PocketBase from "pocketbase";

const PORT = process.env.PORT || 3500;
const CLAUDE_KEY = process.env.CLAUDE_KEY;
const GMAPS_KEY = process.env.GMAPS_KEY;
const POCKETBASE_URL = process.env.POCKETBASE_URL || "https://data.huynh.place";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://home.huynh.place,http://localhost:3000").split(",");

const WORK_ADDRESS = "1635 Aurora Ct, Aurora, CO 80045";

const SYSTEM_PROMPT = `You are a real estate data extraction tool. Your ONLY job is to find property listing data using web search.

CRITICAL RULES:
1. Use web search to find the property listing
2. Search for the address and look at multiple results to gather complete data
3. After finding the data, respond with ONLY a raw JSON object
4. Do NOT include any explanation, markdown, backticks, or commentary
5. If you truly cannot find any listing data, return: {"error":"not found"}

JSON format:
{"address":"string","city":"string","neighborhood":"string or empty","style":"House"|"Townhouse"|"Condo","price":number,"sqft":number,"bed":number,"bath":number,"hoa":number or 0,"parking":"None"|"Reserved (1)"|"Reserved (2)"|"Garage (1)"|"Garage (2)","kitchen":"Open"|"Closed"|"Halfway","photoUrl":"string or null"}

Rules for fields:
- price: list price in dollars (number, no commas). If only rent price found, still return it.
- Townhome/rowhome = "Townhouse", condo/apartment = "Condo", single family = "House"
- Garage = "Garage (N)", assigned/reserved parking = "Reserved (N)", otherwise "None"
- kitchen: if not clearly stated, use "Open"
- photoUrl: main listing photo URL if visible in search results, otherwise null
- Use 0 for unknown numeric fields

Your response must be ONLY the JSON object. Nothing else.`;

function extractAddressFromUrl(url) {
  try {
    const decoded = decodeURIComponent(url);
    const redfin = decoded.match(/\/([A-Z]{2})\/([^/]+)\/([^/]+?)(?:-\d{5})?\/home/i);
    if (redfin) {
      const addr = redfin[3].replace(/-/g, " ");
      return addr + ", " + redfin[2] + ", " + redfin[1];
    }
    const zillow = decoded.match(/homedetails\/([^/]+?)(?:\/|\?)/i);
    if (zillow) return zillow[1].replace(/-/g, " ");
    const generic = decoded.match(/(\d+[^/]*(?:St|Ave|Blvd|Dr|Ct|Rd|Ln|Way|Pl|Cir)[^/]*)/i);
    if (generic) return generic[1].replace(/-/g, " ");
  } catch (e) {}
  return null;
}

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Require a valid PocketBase auth token — these endpoints call paid third-party
// APIs (Anthropic, Google Maps) using shared keys, so they must not be callable
// by anonymous internet traffic even though the dashboard's own data is public.
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Missing auth token" });

  try {
    const pb = new PocketBase(POCKETBASE_URL);
    pb.authStore.save(token, null);
    await pb.collection("users").authRefresh();
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid or expired auth token" });
  }
}

app.post("/extract-listing", requireAuth, async (req, res) => {
  const url = req.body && req.body.url;
  if (!url) return res.status(400).json({ error: "No URL provided" });

  const addressHint = extractAddressFromUrl(url);
  const userMessage = addressHint
    ? `Search for this property listing and extract the data as JSON. Address: ${addressHint} (from listing URL: ${url})`
    : `Search the web for this real estate listing and extract the property data as JSON: ${url}`;

  try {
    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      }),
    });

    const result = await apiRes.json();
    if (result.error) {
      return res.status(502).json({ error: "Claude API error: " + result.error.message });
    }
    if (!result.content || !Array.isArray(result.content)) {
      return res.status(502).json({ error: "Unexpected response format" });
    }

    let text = "";
    for (const block of result.content) {
      if (block.type === "text") text += block.text;
    }
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(502).json({ error: "Could not extract listing data" });

    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.error) return res.status(404).json({ error: "Listing not found" });

    return res.json(parsed);
  } catch (e) {
    console.error("extract-listing error:", e);
    return res.status(500).json({ error: "Failed to parse listing data" });
  }
});

app.post("/get-commute", requireAuth, async (req, res) => {
  const { address, city, departureTime } = req.body || {};
  if (!address) return res.json({ commute: null });

  const origin = encodeURIComponent(address + ", " + (city || "Denver") + ", CO");
  const dest = encodeURIComponent(WORK_ADDRESS);
  const departureParam = departureTime ? `&departure_time=${departureTime}` : "&departure_time=now";

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${dest}${departureParam}&key=${GMAPS_KEY}`;

  try {
    const apiRes = await fetch(url);
    const result = await apiRes.json();
    if (result.routes && result.routes.length > 0) {
      const leg = result.routes[0].legs[0];
      const sec = (leg.duration_in_traffic || leg.duration).value;
      return res.json({ commute: Math.round(sec / 60) });
    }
    return res.json({ commute: null });
  } catch (e) {
    console.error("get-commute error:", e);
    return res.json({ commute: null });
  }
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`home-search-hq backend listening on :${PORT}`));
