import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addTeamAdmin, resolveLandlordDisplayName } from './team.js'

function createFakeAdminClient({
  createdId = 'auth-new-admin',
  createError = null,
  memberError = null,
} = {}) {
  const insertedMembers = []
  const insertedProfiles = []
  const deletedUsers = []
  const createdCalls = []

  return {
    insertedMembers,
    insertedProfiles,
    deletedUsers,
    createdCalls,
    auth: {
      admin: {
        createUser: async (payload) => {
          createdCalls.push(payload)
          if (createError) return { data: null, error: createError }
          return { data: { user: { id: createdId, email: payload.email } }, error: null }
        },
        deleteUser: async (id) => {
          deletedUsers.push(id)
          return { error: null }
        },
      },
    },
    from: (table) => ({
      insert: async (row) => {
        if (table === 'landlord_members') {
          insertedMembers.push(row)
          return { error: memberError }
        }
        if (table === 'landlord_profiles') {
          insertedProfiles.push(row)
          return { error: null }
        }
        throw new Error(`Unexpected table write: ${table}`)
      },
    }),
  }
}

test('addTeamAdmin attaches the new admin to the existing team without creating a second landlord_profile', async () => {
  const supabaseAdmin = createFakeAdminClient({ createdId: 'auth-co-admin-1' })

  const result = await addTeamAdmin({
    supabaseAdmin,
    landlordId: 'team-primary-1',
    name: '  Wayne  ',
    email: '  wayne@example.com ',
    password: 'password123',
  })

  assert.equal(result.ok, true)
  assert.equal(result.status, 200)
  assert.deepEqual(result.user, {
    id: 'auth-co-admin-1',
    landlordId: 'team-primary-1',
    name: 'Wayne',
    email: 'wayne@example.com',
    role: 'admin',
  })
  assert.equal(supabaseAdmin.insertedProfiles.length, 0)
  assert.deepEqual(supabaseAdmin.insertedMembers, [
    { auth_user_id: 'auth-co-admin-1', landlord_id: 'team-primary-1', role: 'owner' },
  ])
  assert.equal(supabaseAdmin.createdCalls[0].email_confirm, true)
  assert.deepEqual(supabaseAdmin.createdCalls[0].user_metadata, { role: 'landlord', name: 'Wayne' })
})

test('addTeamAdmin rolls back the auth user if landlord_members insert fails', async () => {
  const supabaseAdmin = createFakeAdminClient({
    createdId: 'auth-rollback-1',
    memberError: { message: 'foreign key violation' },
  })

  const result = await addTeamAdmin({
    supabaseAdmin,
    landlordId: 'team-primary-1',
    name: 'Smithers',
    email: 'smithers@example.com',
    password: 'password123',
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 400)
  assert.equal(result.error, 'foreign key violation')
  assert.deepEqual(supabaseAdmin.deletedUsers, ['auth-rollback-1'])
})

test('addTeamAdmin validates required fields, password length, and duplicate email error', async () => {
  const fake = createFakeAdminClient()

  const missing = await addTeamAdmin({
    supabaseAdmin: fake,
    landlordId: 'team-1',
    name: '',
    email: 'a@b.com',
    password: 'password123',
  })
  assert.equal(missing.ok, false)
  assert.equal(missing.status, 400)
  assert.equal(fake.createdCalls.length, 0)

  const shortPw = await addTeamAdmin({
    supabaseAdmin: fake,
    landlordId: 'team-1',
    name: 'Admin',
    email: 'a@b.com',
    password: 'short',
  })
  assert.equal(shortPw.ok, false)
  assert.equal(shortPw.status, 400)
  assert.equal(fake.createdCalls.length, 0)

  const dupFake = createFakeAdminClient({
    createError: { message: 'A user with this email address has already been registered' },
  })
  const dup = await addTeamAdmin({
    supabaseAdmin: dupFake,
    landlordId: 'team-1',
    name: 'Admin',
    email: 'taken@example.com',
    password: 'password123',
  })
  assert.equal(dup.ok, false)
  assert.equal(dup.error, 'An account with this email already exists.')
})

test('resolveLandlordDisplayName prefers member metadata name over shared team profile name', () => {
  assert.equal(
    resolveLandlordDisplayName(
      { email: 'wayne@example.com', user_metadata: { name: 'Wayne' } },
      { name: 'Brian Mar' },
    ),
    'Wayne',
  )
  assert.equal(
    resolveLandlordDisplayName(
      { email: 'owner@example.com', user_metadata: {} },
      { name: 'Brian Mar' },
    ),
    'Brian Mar',
  )
  assert.equal(
    resolveLandlordDisplayName(
      { email: 'fallback@example.com', user_metadata: { name: '  ' } },
      { name: '' },
    ),
    'fallback',
  )
})
