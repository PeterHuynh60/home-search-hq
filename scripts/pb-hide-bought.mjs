// Keeps the bought home (our actual address) private.
//
// - homes: logged-out visitors can no longer list/view/subscribe to the bought record.
// - homes_bought_public: a read-only view exposing only non-identifying fields of the
//   bought home (no address, link, photo, notes), so the dashboard and huynh.place
//   can still show a "We bought a home" card to the public.
//
// Usage: PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/pb-hide-bought.mjs

import PocketBase from 'pocketbase'

const PB_URL = process.env.PB_URL || 'https://data.huynh.place'
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD

if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
  console.error('Set PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD env vars.')
  process.exit(1)
}

const pb = new PocketBase(PB_URL)

const HOMES_READ_RULE = 'bought = false || @request.auth.id != ""'
const PUBLIC_VIEW_NAME = 'homes_bought_public'
const PUBLIC_VIEW_QUERY = `SELECT id, city, neighborhood, style, price, sqft, bed, bath, hoa, kitchen,
  parking, commute, michelleRating, peterRating, tourStatus, momPick, bought, added, addedAt
  FROM homes WHERE bought = TRUE`

async function main() {
  await pb.collection('_superusers').authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD)
  console.log('Authenticated as superuser.')

  await pb.collections.update('homes', { listRule: HOMES_READ_RULE, viewRule: HOMES_READ_RULE })
  console.log(`homes list/view rule -> ${HOMES_READ_RULE}`)

  const viewDef = { name: PUBLIC_VIEW_NAME, type: 'view', viewQuery: PUBLIC_VIEW_QUERY, listRule: '', viewRule: '' }
  try {
    await pb.collections.getOne(PUBLIC_VIEW_NAME)
    await pb.collections.update(PUBLIC_VIEW_NAME, viewDef)
    console.log(`Updated view "${PUBLIC_VIEW_NAME}".`)
  } catch {
    await pb.collections.create(viewDef)
    console.log(`Created view "${PUBLIC_VIEW_NAME}".`)
  }

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
