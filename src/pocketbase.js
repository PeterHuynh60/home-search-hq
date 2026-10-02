import PocketBase from "pocketbase";

export const pb = new PocketBase(process.env.REACT_APP_POCKETBASE_URL || "https://data.huynh.place");
pb.autoCancellation(false);

const API_BASE = process.env.REACT_APP_API_BASE || "https://home-api.huynh.place";

export async function extractListingFn(url) {
  const res = await fetch(`${API_BASE}/extract-listing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: pb.authStore.token ? `Bearer ${pb.authStore.token}` : "",
    },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to extract listing");
  return data;
}

export async function getCommuteFn(params) {
  const res = await fetch(`${API_BASE}/get-commute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: pb.authStore.token ? `Bearer ${pb.authStore.token}` : "",
    },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to get commute");
  return data;
}
