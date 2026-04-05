import * as grpc from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import path from "path";

const SERVER_ADDRESS = process.env.SERVER_ADDRESS ?? "localhost:50051";
const ANNOUNCER_ID = process.env.ANNOUNCER_ID ?? "panitia-01";
const ANNOUNCER_ROLE = process.env.ANNOUNCER_ROLE ?? "panitia";
const TITLE = process.env.ANNOUNCEMENT_TITLE ?? "Info Konser";
const MESSAGE =
  process.env.ANNOUNCEMENT_MESSAGE ?? "Konser dimulai 15 menit lagi.";

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

async function runPanitiaClient(): Promise<void> {
  const announcementProto = loadProto("../../proto/announcement.proto");
  const AnnouncementServiceClient =
    announcementProto.liveconcert.announcement.AnnouncementService;

  const announcementClient = new AnnouncementServiceClient(
    SERVER_ADDRESS,
    grpc.credentials.createInsecure(),
  );

  console.log(`[Panitia ${ANNOUNCER_ID}] Connecting to ${SERVER_ADDRESS}...`);

  try {
    const result = await unaryCall<any, any>(
      announcementClient,
      "PushAnnouncement",
      {
        announcer_id: ANNOUNCER_ID,
        announcer_role: ANNOUNCER_ROLE,
        title: TITLE,
        message: MESSAGE,
      },
    );

    console.log("[PushAnnouncement]", result);
  } catch (err) {
    const grpcError = err as grpc.ServiceError;
    console.error(
      "[PushAnnouncement Error]",
      grpcError.code,
      grpcError.message,
    );
  } finally {
    announcementClient.close();
  }
}

runPanitiaClient().catch((err) => {
  console.error("Panitia client failed:", err);
  process.exit(1);
});
