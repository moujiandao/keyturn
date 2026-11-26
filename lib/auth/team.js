// Pure helpers for landlord team membership and member display identity.
//
// A landlord workspace is a team (`landlord_profiles.id`). Multiple auth users
// share one team via `landlord_members (auth_user_id -> landlord_id)`.
// Creating a co-admin from Settings -> Admin Users must add a membership row
// to the caller's existing team, never create a separate `landlord_profiles`
// workspace.

export function resolveLandlordDisplayName(authUser, landlordProfile) {
  const memberName = typeof authUser?.user_metadata?.name === 'string'
    ? authUser.user_metadata.name.trim()
    : ''
  if (memberName) return memberName

  const teamName = typeof landlordProfile?.name === 'string'
    ? landlordProfile.name.trim()
    : ''
  if (teamName) return teamName

  return authUser?.email?.split('@')[0] || ''
}

export async function addTeamAdmin({ supabaseAdmin, landlordId, name, email, password }) {
  const trimmedName = typeof name === 'string' ? name.trim() : ''
  const trimmedEmail = typeof email === 'string' ? email.trim() : ''
  const rawPassword = typeof password === 'string' ? password : ''

  if (!landlordId) {
    return { ok: false, status: 403, error: 'Landlord team context is required.' }
  }
  if (!trimmedName || !trimmedEmail || !rawPassword) {
    return { ok: false, status: 400, error: 'Name, email, and password are required.' }
  }
  if (!trimmedEmail.includes('@')) {
    return { ok: false, status: 400, error: 'Please enter a valid email address.' }
  }
  if (rawPassword.length < 8) {
    return { ok: false, status: 400, error: 'Password must be at least 8 characters.' }
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: trimmedEmail,
    password: rawPassword,
    email_confirm: true,
    user_metadata: { role: 'landlord', name: trimmedName },
  })

  if (authError || !authData?.user?.id) {
    const rawMsg = authError?.message || 'Could not create admin account.'
    const message = /already\s+(been\s+)?registered/i.test(rawMsg)
      ? 'An account with this email already exists.'
      : rawMsg
    return { ok: false, status: 400, error: message }
  }

  const authUserId = authData.user.id
  const { error: memberError } = await supabaseAdmin
    .from('landlord_members')
    .insert({ auth_user_id: authUserId, landlord_id: landlordId, role: 'owner' })

  if (memberError) {
    try {
      await supabaseAdmin.auth.admin.deleteUser(authUserId)
    } catch (rollbackError) {
      console.error('[add-admin] rollback deleteUser failed:', authUserId, rollbackError)
    }
    return { ok: false, status: 400, error: memberError.message }
  }

  return {
    ok: true,
    status: 200,
    user: {
      id: authUserId,
      landlordId,
      name: trimmedName,
      email: trimmedEmail,
      role: 'admin',
    },
  }
}
