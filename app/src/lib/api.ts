/** The dev API (§11), served by `stratum dev` on localhost. Absent in a static build, where actions copy CLI commands. */

export async function apiAvailable(): Promise<boolean> {
  try {
    return (await fetch('/api/health', { cache: 'no-store' })).ok;
  } catch {
    return false;
  }
}

export async function post(path: '/api/start' | '/api/pin', body: { id: string | null }): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return res.ok ? { ok: true } : { ok: false, error: data.error ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Live updates: the server rebuilds on file changes and announces each new map. Returns an unsubscribe. */
export function subscribe(onMap: (error: string | null) => void): () => void {
  const es = new EventSource('/api/events');
  es.addEventListener('map', (e) => {
    const data = JSON.parse((e as MessageEvent<string>).data) as { error: string | null };
    onMap(data.error);
  });
  return () => es.close();
}
