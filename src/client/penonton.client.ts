import * as grpc from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import path from "path";

const SERVER_ADDRESS = process.env.SERVER_ADDRESS ?? "localhost:50051";
const USER_ID = process.env.USER_ID ?? "penonton-01";
const SEAT_NUMBER = process.env.SEAT_NUMBER ?? "A1";
const SONG_TITLE = process.env.SONG_TITLE ?? "Laskar Pelangi";

function loadProto(protoRelativePath: string): any {
  const protoPath = path.resolve(__dirname, protoRelativePath);
  const packageDefinition = loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  return grpc.loadPackageDefinition(packageDefinition) as any;
}

function unaryCall<TReq, TRes>(
  client: any,
  method: string,
  request: TReq,
): Promise<TRes> {
  return new Promise((resolve, reject) => {
    client[method](request, (err: grpc.ServiceError | null, response: TRes) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(response);
    });
  });
}

async function runPenontonClient(): Promise<void> {
  const ticketProto = loadProto("../../proto/ticket.proto");
  const votingProto = loadProto("../../proto/voting.proto");
  const announcementProto = loadProto("../../proto/announcement.proto");

  const TicketServiceClient = ticketProto.liveconcert.ticket.TicketService;
  const VotingServiceClient = votingProto.liveconcert.voting.VotingService;
  const AnnouncementServiceClient =
    announcementProto.liveconcert.announcement.AnnouncementService;

  const credentials = grpc.credentials.createInsecure();
  const ticketClient = new TicketServiceClient(SERVER_ADDRESS, credentials);
  const votingClient = new VotingServiceClient(SERVER_ADDRESS, credentials);
  const announcementClient = new AnnouncementServiceClient(
    SERVER_ADDRESS,
    credentials,
  );

  console.log(`[Penonton ${USER_ID}] Connecting to ${SERVER_ADDRESS}...`);

  const announcementStream = announcementClient.StreamAnnouncements({
    user_id: USER_ID,
  });

  announcementStream.on("data", (data: any) => {
    console.log(
      `[Announcement] ${data.title} | ${data.message} (by ${data.published_by})`,
    );
  });

  announcementStream.on("error", (err: grpc.ServiceError) => {
    console.error("[Announcement Stream Error]", err.code, err.message);
  });

  const voteStream = votingClient.StreamVoteResults({ user_id: USER_ID });
  voteStream.on("data", (data: any) => {
    const printable = (data.results ?? [])
      .map((r: any) => `${r.song_title}:${r.total_votes}`)
      .join(", ");
    console.log(`[Vote Results] ${printable || "No votes yet"}`);
  });

  voteStream.on("error", (err: grpc.ServiceError) => {
    console.error("[Vote Stream Error]", err.code, err.message);
  });

  try {
    const availability = await unaryCall<any, any>(
      ticketClient,
      "CheckAvailability",
      {},
    );
    console.log("[CheckAvailability]", availability);

    const buyTicketResult = await unaryCall<any, any>(
      ticketClient,
      "BuyTicket",
      {
        user_id: USER_ID,
        seat_number: SEAT_NUMBER,
      },
    );
    console.log("[BuyTicket]", buyTicketResult);

    const submitVoteResult = await unaryCall<any, any>(
      votingClient,
      "SubmitVote",
      {
        user_id: USER_ID,
        song_title: SONG_TITLE,
      },
    );
    console.log("[SubmitVote]", submitVoteResult);
  } catch (err) {
    const grpcError = err as grpc.ServiceError;
    console.error("[Unary Error]", grpcError.code, grpcError.message);
  }

  console.log("Penonton client running. Press Ctrl+C to stop.");

  process.on("SIGINT", () => {
    announcementStream.cancel();
    voteStream.cancel();
    ticketClient.close();
    votingClient.close();
    announcementClient.close();
    process.exit(0);
  });
}

runPenontonClient().catch((err) => {
  console.error("Penonton client failed:", err);
  process.exit(1);
});
