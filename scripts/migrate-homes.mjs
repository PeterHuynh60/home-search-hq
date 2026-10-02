// One-time migration: imports the exported Firestore homes collection
// (scripts/homes-export.json, pulled manually via Cloud Shell since the
// Firebase project's admin/service-account access was lost) into PocketBase.
//
// Usage: PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... APP_USER_ID=... node scripts/migrate-homes.mjs

import { readFileSync } from 'node:fs'
import PocketBase from 'pocketbase'

const PB_URL = process.env.PB_URL || 'https://data.huynh.place'
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD
const APP_USER_ID = process.env.APP_USER_ID

if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD || !APP_USER_ID) {
  console.error('Set PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD, and APP_USER_ID env vars.')
  process.exit(1)
}

const homes = JSON.parse(readFileSync(new URL('./homes-export.json', import.meta.url)))

const pb = new PocketBase(PB_URL)

function toPayload(h) {
  return {
    user: APP_USER_ID,
    legacyId: h.id,
    address: h.address ?? '',
    city: h.city ?? '',
    neighborhood: h.neighborhood ?? '',
    style: h.style ?? '',
    price: h.price ?? 0,
    sqft: h.sqft ?? 0,
    downPayment: h.downPayment ?? null,
    hoa: h.hoa ?? 0,
    bed: h.bed ?? 0,
    bath: h.bath ?? 0,
    kitchen: h.kitchen ?? '',
    parking: h.parking ?? '',
    link: h.link ?? '',
    added: h.added ?? '',
    addedAt: h.addedAt ?? '',
    tourStatus: h.tourStatus ?? '',
    notes: h.notes ?? '',
    status: h.status ?? 'Waiting',
    michelleRating: h.michelleRating ?? null,
    peterRating: h.peterRating ?? null,
    commute: h.commute ?? null,
    momPick: !!h.momPick,
    sold: !!h.sold,
    pending: !!h.pending,
    tooExpensive: !!h.tooExpensive,
    bought: !!h.bought,
    photoUrl: h.photoUrl ?? '',
  }
}

async function main() {
  await pb.collection('_superusers').authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD)
  console.log('Authenticated as superuser.')

  let count = 0
  for (const h of homes) {
    await pb.collection('homes').create(toPayload(h))
    count++
  }
  console.log(`Migrated ${count} homes.`)
}

main().catch((err) => {
  console.error(err?.response ?? err)
  process.exit(1)
})
