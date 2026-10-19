// Offline sync - queue changes when offline, sync when online

const QUEUE_KEY = "offline_queue";

export function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addToQueue(action) {
  const queue = getQueue();
  queue.push({ ...action, timestamp: Date.now() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function clearQueue() {
  localStorage.removeItem(QUEUE_KEY);
}

export async function syncQueue(apiCall) {
  const queue = getQueue();
  if (queue.length === 0) return { synced: 0 };
  
  let synced = 0;
  const failed = [];
  
  for (const action of queue) {
    try {
      await apiCall(action);
      synced++;
    } catch (err) {
      failed.push(action);
    }
  }
  
  localStorage.setItem(QUEUE_KEY, JSON.stringify(failed));
  return { synced, failed: failed.length };
}

export function isOnline() {
  return navigator.onLine;
}

export function onOnline(callback) {
  window.addEventListener("online", callback);
  return () => window.removeEventListener("online", callback);
}
