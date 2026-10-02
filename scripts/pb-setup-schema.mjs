// One-time PocketBase schema setup for the home search dashboard.
// Reuses the same PocketBase instance as gym-dashboard/bet-dashboard (same single user).
// Public read (matches old Firestore behavior — data.huynh.place viewable before sign-in),
// owner-only write.
//
// Usage: PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/pb-setup-schema.mjs

import PocketBase from 'pocketbase'

const PB_URL = process.env.PB_URL || 'https://data.huynh.place'
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD

if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
  console.error('Set PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD env vars.')
  process.exit(1)
}

const pb = new PocketBase(PB_URL)

const OWN_ROW_RULE = 'user = @request.auth.id'
const CREATE_RULE = '@request.auth.id != "" && user = @request.auth.id'
const PUBLIC_READ_RULE = ''

async function ensureCollection(def) {
  try {
    const existing = await pb.collections.getOne(def.name)
    console.log(`Collection "${def.name}" already exists (${existing.id}), skipping.`)
    return existing
  } catch {
    const created = await pb.collections.create(def)
    console.log(`Created collection "${def.name}" (${created.id}).`)
    return created
  }
}

async function main() {
  await pb.collection('_superusers').authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD)
  console.log('Authenticated as superuser.')

  const usersCollection = await pb.collections.getOne('users')

  await ensureCollection({
    name: 'homes',
    type: 'base',
    fields: [
      { name: 'user', type: 'relation', required: true, collectionId: usersCollection.id, maxSelect: 1, cascadeDelete: true },
      { name: 'legacyId', type: 'text' },
      { name: 'address', type: 'text' },
      { name: 'city', type: 'text' },
      { name: 'neighborhood', type: 'text' },
      { name: 'style', type: 'text' },
      { name: 'price', type: 'number' },
      { name: 'sqft', type: 'number' },
      { name: 'downPayment', type: 'number' },
      { name: 'hoa', type: 'number' },
      { name: 'bed', type: 'number' },
      { name: 'bath', type: 'number' },
      { name: 'kitchen', type: 'text' },
      { name: 'parking', type: 'text' },
      { name: 'link', type: 'text' },
      { name: 'added', type: 'text' },
      { name: 'addedAt', type: 'text' },
      { name: 'tourStatus', type: 'text' },
      { name: 'notes', type: 'text' },
      { name: 'status', type: 'text' },
      { name: 'michelleRating', type: 'number' },
      { name: 'peterRating', type: 'number' },
      { name: 'commute', type: 'number' },
      { name: 'momPick', type: 'bool' },
      { name: 'sold', type: 'bool' },
      { name: 'pending', type: 'bool' },
      { name: 'tooExpensive', type: 'bool' },
      { name: 'bought', type: 'bool' },
      { name: 'photoUrl', type: 'text' },
    ],
    listRule: PUBLIC_READ_RULE,
    viewRule: PUBLIC_READ_RULE,
    createRule: CREATE_RULE,
    updateRule: OWN_ROW_RULE,
    deleteRule: OWN_ROW_RULE,
  })

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
