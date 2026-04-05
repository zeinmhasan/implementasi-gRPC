import {
  sendUnaryData,
  ServerUnaryCall,
  ServerWritableStream,
  status,
} from "@grpc/grpc-js";

import { store } from "../state/store";

interface PushAnnouncementRequest {
  announcer_id: string;
  announcer_role: string;
  title: string;
  message: string;
}

interface PushAnnouncementResponse {
  success: boolean;
  message: string;
}

interface StreamAnnouncementsRequest {
  user_id: string;
}

interface AnnouncementUpdate {
  title: string;
  message: string;
  published_by: string;
  published_at_unix: number;
}

function pushAnnouncement(
  call: ServerUnaryCall<PushAnnouncementRequest, PushAnnouncementResponse>,
  callback: sendUnaryData<PushAnnouncementResponse>,
): void {
  const announcerId = (call.request.announcer_id ?? "").trim();
  const announcerRole = (call.request.announcer_role ?? "")
    .trim()
    .toLowerCase();
  const title = (call.request.title ?? "").trim();
  const message = (call.request.message ?? "").trim();

  if (!announcerId || !announcerRole || !title || !message) {
    callback({
      code: status.INVALID_ARGUMENT,
      message: "announcer_id, announcer_role, title, and message are required",
    });
    return;
  }

  const result = store.pushAnnouncement(
    announcerId,
    announcerRole,
    title,
    message,
  );

  if (result.status === "unauthenticated") {
    callback({
      code: status.UNAUTHENTICATED,
      message: "Only panitia can push announcements",
    });
    return;
  }

  if (result.status === "no_subscribers") {
    callback({
      code: status.UNAVAILABLE,
      message: "No active subscribers for announcements",
    });
    return;
  }

  callback(null, {
    success: true,
    message: "Announcement broadcasted successfully",
  });
}

function streamAnnouncements(
  call: ServerWritableStream<StreamAnnouncementsRequest, AnnouncementUpdate>,
): void {
  const userId = (call.request.user_id ?? "").trim();

  if (!userId) {
    const err = new Error("user_id is required") as Error & { code: number };
    err.code = status.INVALID_ARGUMENT;
    call.destroy(err);
    return;
  }

  const subscriberId = `ann-sub-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const pushAnnouncementUpdate = (update: {
    title: string;
    message: string;
    publishedBy: string;
    publishedAtUnix: number;
  }): void => {
    call.write({
      title: update.title,
      message: update.message,
      published_by: update.publishedBy,
      published_at_unix: update.publishedAtUnix,
    });
  };

  store.subscribeAnnouncements(subscriberId, pushAnnouncementUpdate);

  const history = store.getAnnouncements();
  for (const announcement of history) {
    pushAnnouncementUpdate(announcement);
  }

  const cleanup = (): void => {
    store.unsubscribeAnnouncements(subscriberId);
  };

  call.on("cancelled", cleanup);
  call.on("close", cleanup);
  call.on("error", cleanup);
}

export const announcementServiceHandlers = {
  PushAnnouncement: pushAnnouncement,
  StreamAnnouncements: streamAnnouncements,
};
