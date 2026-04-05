import {
  loadPackageDefinition,
  Server,
  ServerCredentials,
} from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import path from "path";

import { announcementServiceHandlers } from "./services/announcement.service";
import { ticketServiceHandlers } from "./services/ticket.service";
import { votingServiceHandlers } from "./services/voting.service";
import { store } from "./state/store";

const PORT = process.env.PORT ?? "50051";
const VOTING_OPEN = process.env.VOTING_OPEN ?? "true";

function loadProto(protoRelativePath: string): any {
  const protoPath = path.resolve(__dirname, protoRelativePath);
  const packageDefinition = loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  return loadPackageDefinition(packageDefinition) as any;
}

const ticketProto = loadProto("../../proto/ticket.proto");
const votingProto = loadProto("../../proto/voting.proto");
const announcementProto = loadProto("../../proto/announcement.proto");

const TicketService = ticketProto.liveconcert.ticket.TicketService;
const VotingService = votingProto.liveconcert.voting.VotingService;
const AnnouncementService =
  announcementProto.liveconcert.announcement.AnnouncementService;

function setupGracefulShutdown(server: Server): void {
  const shutdown = (signal: string): void => {
    console.log(`Received ${signal}. Shutting down gRPC server...`);
    server.tryShutdown((err) => {
      if (err) {
        console.error("Graceful shutdown failed, forcing shutdown:", err);
        server.forceShutdown();
      }
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

function startServer(): void {
  const server = new Server();
  const votingIsOpen = VOTING_OPEN.toLowerCase() === "true";

  store.setVotingOpen(votingIsOpen);
  server.addService(TicketService.service, ticketServiceHandlers);
  server.addService(VotingService.service, votingServiceHandlers);
  server.addService(AnnouncementService.service, announcementServiceHandlers);
  setupGracefulShutdown(server);

  server.bindAsync(
    `0.0.0.0:${PORT}`,
    ServerCredentials.createInsecure(),
    (err) => {
      if (err) {
        console.error("Failed to bind gRPC server:", err);
        process.exit(1);
      }

      server.start();
      console.log(`gRPC server running on 0.0.0.0:${PORT}`);
      console.log(`Voting is ${votingIsOpen ? "OPEN" : "CLOSED"}`);
      console.log("Press Ctrl+C to stop server gracefully");
    },
  );
}

startServer();
