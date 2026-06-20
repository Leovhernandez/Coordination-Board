import "server-only";

const topicFor = (jobId: string) => `job-${jobId}`;

/**
 * Fires a Realtime Broadcast on a job's channel from the server (no websocket).
 * Participants use the anon key and can't receive RLS-filtered postgres_changes,
 * so they subscribe to this public broadcast channel instead. The payload is
 * intentionally empty — it's only a "something changed, refresh" signal, so no
 * phase data is exposed to anyone listening.
 */
export async function broadcastJobChange(jobId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  const topic = topicFor(jobId);
  const endpoint = `${url}/realtime/v1/api/broadcast/${encodeURIComponent(topic)}/events/change`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: "{}",
    });
    if (!res.ok && process.env.NODE_ENV === "development") {
      console.warn(`broadcastJobChange ${topic}: HTTP ${res.status}`);
    }
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`broadcastJobChange ${topic}:`, err);
    }
  }
}