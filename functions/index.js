const functions = require("firebase-functions");
const fetch = require("node-fetch");

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
  // Try to extract address from common listing URL patterns
  // Redfin: /CO/Denver/2847-W-4th-Ave-80219/home/34112252
  // Zillow: /homedetails/123-Main-St-Denver-CO-80219/12345_zpid/
  // Realtor: /realestateandhomes-detail/123-Main-St_Denver_CO_80219
  try {
    var decoded = decodeURIComponent(url);
    // Redfin pattern
    var redfin = decoded.match(/\/([A-Z]{2})\/([^/]+)\/([^/]+?)(?:-\d{5})?\/home/i);
    if (redfin) {
      var addr = redfin[3].replace(/-/g, " ");
      return addr + ", " + redfin[2] + ", " + redfin[1];
    }
    // Zillow pattern
    var zillow = decoded.match(/homedetails\/([^/]+?)(?:\/|\?)/i);
    if (zillow) {
      return zillow[1].replace(/-/g, " ");
    }
    // Generic: try to find address-like pattern in URL
    var generic = decoded.match(/(\d+[^/]*(?:St|Ave|Blvd|Dr|Ct|Rd|Ln|Way|Pl|Cir)[^/]*)/i);
    if (generic) {
      return generic[1].replace(/-/g, " ");
    }
  } catch (e) {}
  return null;
}

exports.extractListing = functions.https.onCall(async (data) => {
  const CLAUDE_KEY = process.env.CLAUDE_KEY;

  // Try multiple paths to find the URL
  var url = null;
  if (typeof data === "string") url = data;
  else if (data && data.url) url = data.url;
  else if (data && data.data && data.data.url) url = data.data.url;

  console.log("data type:", typeof data);
  console.log("data.url:", data ? data.url : "no data");
  console.log("data keys:", data ? Object.keys(data).join(", ") : "no data");
  console.log("Resolved URL:", url);

  if (!url) {
    throw new functions.https.HttpsError("invalid-argument", "No URL provided");
  }

  const addressHint = extractAddressFromUrl(url);

  console.log("URL received:", url);
  console.log("Address extracted from URL:", addressHint);

  var userMessage;
  if (addressHint) {
    userMessage = "Search for this property listing and extract the data as JSON. Address: " + addressHint + " (from listing URL: " + url + ")";
  } else {
    userMessage = "Search the web for this real estate listing and extract the property data as JSON: " + url;
  }

  console.log("Sending to Claude:", userMessage);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": CLAUDE_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }]
    })
  });

  const result = await res.json();
  console.log("Claude API status:", res.status);

  if (result.error) {
    console.error("Claude API error:", result.error);
    throw new functions.https.HttpsError("internal", "Claude API error: " + result.error.message);
  }

  if (!result.content || !Array.isArray(result.content)) {
    console.error("Unexpected response:", JSON.stringify(result).substring(0, 500));
    throw new functions.https.HttpsError("internal", "Unexpected response format");
  }

  var text = "";
  for (var i = 0; i < result.content.length; i++) {
    if (result.content[i].type === "text") text += result.content[i].text;
  }
  console.log("Raw text response:", text.substring(0, 500));

  text = text.replace(/```json/g, "").replace(/```/g, "").trim();

  var jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("No JSON found in response:", text.substring(0, 300));
    throw new functions.https.HttpsError("internal", "Could not extract listing data");
  }

  try {
    var parsed = JSON.parse(jsonMatch[0]);
    if (parsed.error) {
      console.log("Claude said not found. Full response was:", text.substring(0, 300));
      throw new functions.https.HttpsError("not-found", "Listing not found");
    }
    console.log("Successfully extracted:", parsed.address, "Price:", parsed.price);
    return parsed;
  } catch (e) {
    if (e.code === "not-found") throw e;
    console.error("JSON parse failed:", e.message, "Raw:", jsonMatch[0].substring(0, 300));
    throw new functions.https.HttpsError("internal", "Failed to parse listing data");
  }
});

exports.getCommute = functions.https.onCall(async (data) => {
  const GMAPS_KEY = process.env.GMAPS_KEY;
  const origin = encodeURIComponent(
    data.address + ", " + (data.city || "Denver") + ", CO"
  );
  const dest = encodeURIComponent(WORK_ADDRESS);

  const res = await fetch(
    "https://maps.googleapis.com/maps/api/directions/json" +
    "?origin=" + origin +
    "&destination=" + dest +
    "&departure_time=now" +
    "&key=" + GMAPS_KEY
  );
  const result = await res.json();

  if (result.routes && result.routes.length > 0) {
    const leg = result.routes[0].legs[0];
    const sec = (leg.duration_in_traffic || leg.duration).value;
    return { commute: Math.round(sec / 60) };
  }
  return { commute: null };
});
