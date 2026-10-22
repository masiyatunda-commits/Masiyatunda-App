import { TrackSource } from 'livekit-server-sdk';

const projectServerUrl = 'wss://masiyatunda-milkyway-live-mgh6b1np.livekit.cloud';

function livekitEnvironment() {
  const runtime = globalThis as typeof globalThis & { Netlify?: { env?: { get(name: string): string | undefined } } };
  const read = (name: string) => (runtime.Netlify?.env?.get(name) ?? process.env[name])?.trim() || '';
  return { LIVEKIT_URL: read('LIVEKIT_URL') || projectServerUrl, LIVEKIT_API_KEY: read('LIVEKIT_API_KEY'), LIVEKIT_API_SECRET: read('LIVEKIT_API_SECRET') };
}

export function roomPermissions(member: { state: string; hostMuted: boolean }, audioOnly: boolean) {
  return {
    canSubscribe: true,
    canPublishData: false,
    canPublish: member.state === 'speaker' && (!member.hostMuted || !audioOnly),
    canPublishSources: member.state !== 'speaker' ? [] : [
      ...(!audioOnly ? [TrackSource.CAMERA] : []),
      ...(!member.hostMuted ? [TrackSource.MICROPHONE] : []),
    ],
  };
}

export function livekitConfigurationStatus() {
  const environment = livekitEnvironment();
  const missing = (Object.keys(environment) as (keyof typeof environment)[]).filter(name => !environment[name]);
  if (missing.length) return { available: false, reason: 'configuration_missing', missing };
  try {
    const address = new URL(environment.LIVEKIT_URL);
    if (address.origin !== projectServerUrl || address.username || address.password || address.search || address.hash || address.pathname !== '/') return { available: false, reason: 'configuration_invalid', missing: [] };
    return { available: true, reason: 'configuration_present', missing: [] };
  } catch { return { available: false, reason: 'configuration_invalid', missing: [] }; }
}

export function livekitConfig() {
  const { LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret, LIVEKIT_URL: configuredUrl } = livekitEnvironment();
  try {
    const address = new URL(configuredUrl);
    if (address.origin !== projectServerUrl || address.username || address.password || address.search || address.hash || address.pathname !== '/') return null;
    if (!apiKey || !apiSecret) return null;
    return { apiKey, apiSecret, serverUrl: address.origin, serviceUrl: address.origin.replace('wss:', 'https:') };
  } catch { return null; }
}
