/**
 * is_draft value for the profile update in update_draft_profile.
 * When an invitation will be sent, the profile must STAY a draft: activate_draft_profile
 * only accepts rows with is_draft = true and itself marks the new login non-draft.
 */
export function draftFlagForProfileUpdate(sendInvitation: boolean, willInvite: boolean): boolean {
  if (willInvite) return true;
  return !sendInvitation;
}
