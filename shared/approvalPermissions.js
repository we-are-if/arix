const identity = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr');
export function canWithdrawApproval(form, user, isOwner = false) {
  if (!form || form.status === 'approved' || !form.submittedForApproval) return false;
  if (isOwner) return true;
  if (form.preparedByUserId) return String(form.preparedByUserId) === String(user?.id || '');
  return Boolean(identity(form.preparedBy) && identity(form.preparedBy) === identity(user?.name));
}
