import {
  sendUnaryData,
  ServerUnaryCall,
  ServerWritableStream,
  status,
} from "@grpc/grpc-js";

import { store } from "../state/store";

interface SubmitVoteRequest {
  user_id: string;
  song_title: string;
}

interface SubmitVoteResponse {
  success: boolean;
  message: string;
}

interface StreamVoteResultsRequest {
  user_id: string;
}

interface VoteResultsUpdate {
  results: Array<{
    song_title: string;
    total_votes: number;
  }>;
  updated_at_unix: number;
}

function submitVote(
  call: ServerUnaryCall<SubmitVoteRequest, SubmitVoteResponse>,
  callback: sendUnaryData<SubmitVoteResponse>,
): void {
  const userId = (call.request.user_id ?? "").trim();
  const songTitle = (call.request.song_title ?? "").trim();

  if (!userId || !songTitle) {
    callback({
      code: status.INVALID_ARGUMENT,
      message: "user_id and song_title are required",
    });
    return;
  }

  const result = store.submitVote(userId, songTitle);

  if (result.status === "closed") {
    callback({
      code: status.FAILED_PRECONDITION,
      message: "Voting is not open yet",
    });
    return;
  }

  if (result.status === "already_voted") {
    callback({
      code: status.ALREADY_EXISTS,
      message: `User ${userId} already submitted a vote`,
    });
    return;
  }

  callback(null, {
    success: true,
    message: "Vote submitted successfully",
  });
}

function streamVoteResults(
  call: ServerWritableStream<StreamVoteResultsRequest, VoteResultsUpdate>,
): void {
  const userId = (call.request.user_id ?? "").trim();

  if (!userId) {
    const err = new Error("user_id is required") as Error & { code: number };
    err.code = status.INVALID_ARGUMENT;
    call.destroy(err);
    return;
  }

  const subscriberId = `vote-sub-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const pushResults = (update: {
    results: Array<{ songTitle: string; totalVotes: number }>;
    updatedAtUnix: number;
  }): void => {
    call.write({
      results: update.results.map((item) => ({
        song_title: item.songTitle,
        total_votes: item.totalVotes,
      })),
      updated_at_unix: update.updatedAtUnix,
    });
  };

  store.subscribeVoteResults(subscriberId, pushResults);

  pushResults({
    results: store.getVoteResults(),
    updatedAtUnix: Math.floor(Date.now() / 1000),
  });

  const cleanup = (): void => {
    store.unsubscribeVoteResults(subscriberId);
  };

  call.on("cancelled", cleanup);
  call.on("close", cleanup);
  call.on("error", cleanup);
}

export const votingServiceHandlers = {
  SubmitVote: submitVote,
  StreamVoteResults: streamVoteResults,
};
