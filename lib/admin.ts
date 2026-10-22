export async function administratorAccess(account: { app_metadata?: { authorization?: { roles?: unknown }; roles?: unknown } }, base: string, headers: Record<string, string>) {
  const roles = account.app_metadata?.authorization?.roles || account.app_metadata?.roles;
  if (Array.isArray(roles) && roles.includes('admin')) return true;
  const response = await fetch(`${base}/rest/v1/rpc/mw_is_admin`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10000),
  });
  if (response.status === 404) return false;
  if (!response.ok) throw Object.assign(new Error('Administrator access could not be verified. Retry.'), { status: 503, safe: true });
  return await response.json() === true;
}
