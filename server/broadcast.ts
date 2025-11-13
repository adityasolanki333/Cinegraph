// Shared module for WebSocket broadcast functions
// These are set by the main server and used by routes

export let broadcastNotification: ((userId: string, notification: any) => void) | null = null;
export let broadcastCommunityUpdate: ((update: any) => void) | null = null;

export function setBroadcastFunctions(
  notificationFn: (userId: string, notification: any) => void,
  communityUpdateFn: (update: any) => void
) {
  broadcastNotification = notificationFn;
  broadcastCommunityUpdate = communityUpdateFn;
}
