// Instant call signalling over Supabase Realtime broadcast. An open MilkyWay page keeps a websocket to its
// own "mw-calls-<account>" channel, so a ring or answer arrives in milliseconds instead of on the next poll,
// and websocket messages keep arriving while the tab is in the background (timers there are throttled).
// The payload only carries the call id; the page re-reads the call from the call function before acting on it.
export type CallSignal = { kind: 'ring' | 'update'; id: string };

export const callChannel = (accountId: string) => `mw-calls-${accountId}`;

export async function sendCallSignal(base: string, headers: Record<string, string>, recipients: string[], signal: CallSignal) {
  if (!base || !recipients.length) return false;
  const response = await fetch(`${base}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: recipients.map(recipient => ({ topic: callChannel(recipient), event: 'call', payload: signal, private: false })) }),
    signal: AbortSignal.timeout(4000),
  });
  return response.ok;
}
