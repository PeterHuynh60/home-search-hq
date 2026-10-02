import PocketBase from 'pocketbase'
const pb = new PocketBase(process.env.PB_URL || 'https://data.huynh.place')
await pb.collection('_superusers').authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD)
const user = await pb.collection('users').create({
  email: process.env.APP_USER_EMAIL,
  password: process.env.APP_USER_PASSWORD,
  passwordConfirm: process.env.APP_USER_PASSWORD,
  emailVisibility: true,
  verified: true,
})
console.log('Created user:', user.id, user.email)
