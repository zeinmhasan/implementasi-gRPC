import * as grpc from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import path from "path";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";

const SERVER_ADDRESS = process.env.SERVER_ADDRESS ?? "localhost:50051";

type UserRole = "penonton" | "panitia";

interface AuthUser {
  username: string;
  password: string;
  role: UserRole;
}

interface ActiveSession {
  username: string;
  role: UserRole;
}

interface StreamHandles {
  voteStream?: grpc.ClientReadableStream<any>;
  announcementStream?: grpc.ClientReadableStream<any>;
}

interface UIState {
  voteSummary: string;
  announcements: string[];
  lastMessage: string;
}

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

function clearScreen(): void {
  process.stdout.write("\x1Bc");
}

function makeBox(title: string, lines: string[], width: number): string[] {
  const safeWidth = Math.max(60, width);
  const inner = safeWidth - 2;
  const top = `+${"-".repeat(inner)}+`;
  const titleLine = `| ${title.padEnd(inner - 1)}|`;
  const body = lines.map(
    (line) => `| ${line.slice(0, inner - 1).padEnd(inner - 1)}|`,
  );
  return [top, titleLine, top, ...body, top];
}

function formatResult(prefix: string, result: unknown): string {
  return `${prefix}: ${JSON.stringify(result)}`;
}

async function runInteractiveClient(): Promise<void> {
  const ticketProto = loadProto("../../proto/ticket.proto");
  const votingProto = loadProto("../../proto/voting.proto");
  const announcementProto = loadProto("../../proto/announcement.proto");

  const TicketServiceClient = ticketProto.liveconcert.ticket.TicketService;
  const VotingServiceClient = votingProto.liveconcert.voting.VotingService;
  const AnnouncementServiceClient =
    announcementProto.liveconcert.announcement.AnnouncementService;

  const creds = grpc.credentials.createInsecure();
  const ticketClient = new TicketServiceClient(SERVER_ADDRESS, creds);
  const votingClient = new VotingServiceClient(SERVER_ADDRESS, creds);
  const announcementClient = new AnnouncementServiceClient(
    SERVER_ADDRESS,
    creds,
  );

  const rl = createInterface({ input, output });
  const users = new Map<string, AuthUser>();
  let session: ActiveSession | null = null;
  let streams: StreamHandles = {};

  const ui: UIState = {
    voteSummary: "Belum ada data vote",
    announcements: ["Belum ada announcement"],
    lastMessage: "Terhubung ke server. Login atau register untuk mulai.",
  };

  let isPrompting = false;
  let pendingRender = false;
  let allowRenderWhilePrompting = false;
  let activePromptText = "";

  users.set("panitia-01", {
    username: "panitia-01",
    password: "12345",
    role: "panitia",
  });
  users.set("penonton-01", {
    username: "penonton-01",
    password: "12345",
    role: "penonton",
  });

  const currentMenuLines = (): string[] => {
    if (!session) {
      return [
        "Main Menu (Belum Login)",
        "1. Register",
        "2. Login",
        "0. Keluar",
      ];
    }

    if (session.role === "penonton") {
      return [
        `Menu Penonton (${session.username})`,
        "1. Cek ketersediaan kursi",
        "2. Beli tiket",
        "3. Vote lagu",
        "4. Logout",
        "0. Keluar",
      ];
    }

    return [
      `Menu Panitia (${session.username})`,
      "1. Push announcement",
      "2. Logout",
      "0. Keluar",
    ];
  };

  const render = (): void => {
    if (isPrompting && !allowRenderWhilePrompting) {
      pendingRender = true;
      return;
    }

    pendingRender = false;
    clearScreen();

    const width = Math.min(110, Math.max(72, process.stdout.columns ?? 90));
    const showStreamPanel = session?.role === "penonton";
    const streamBox = showStreamPanel
      ? makeBox(
          "STREAM PANEL",
          [
            `Vote: ${ui.voteSummary}`,
            ...ui.announcements.map(
              (item, index) => `Announcement ${index + 1}: ${item}`,
            ),
          ],
          width,
        )
      : [];

    const menuBox = makeBox(
      "MENU",
      [...currentMenuLines(), "", `Hasil Terakhir: ${ui.lastMessage}`],
      width,
    );

    const composed = showStreamPanel
      ? [...streamBox, "", ...menuBox]
      : [...menuBox];

    for (const line of composed) {
      console.log(line);
    }

    if (isPrompting && allowRenderWhilePrompting && activePromptText) {
      console.log(activePromptText);
    } else {
      console.log("Input pilihan lalu tekan Enter.");
    }
  };

  const scheduleRender = (): void => {
    render();
  };

  const cleanupStreams = (): void => {
    streams.voteStream?.cancel();
    streams.announcementStream?.cancel();
    streams = {};
    ui.voteSummary = "Belum ada data vote";
    ui.announcements = ["Belum ada announcement"];
  };

  const closeAll = (): void => {
    cleanupStreams();
    ticketClient.close();
    votingClient.close();
    announcementClient.close();
    rl.close();
  };

  const ask = async (
    question: string,
    liveUpdateWhilePrompting = false,
  ): Promise<string> => {
    isPrompting = true;
    allowRenderWhilePrompting = liveUpdateWhilePrompting;
    activePromptText = `${question}`;
    const answer = await rl.question(`${question} `);
    isPrompting = false;
    allowRenderWhilePrompting = false;
    activePromptText = "";

    if (pendingRender) {
      render();
    }

    return answer.trim();
  };

  const pushAnnouncementLog = (text: string): void => {
    ui.announcements = [text, ...ui.announcements].slice(0, 4);
  };

  const setInfo = (_message: string): void => {
    ui.lastMessage = _message;
    scheduleRender();
  };

  const startPenontonStreams = (userId: string): void => {
    cleanupStreams();

    const announcementStream = announcementClient.StreamAnnouncements({
      user_id: userId,
    });
    announcementStream.on("data", (data: any) => {
      pushAnnouncementLog(
        `${data.title} | ${data.message} (by ${data.published_by})`,
      );
      scheduleRender();
    });
    announcementStream.on("error", (err: grpc.ServiceError) => {
      setInfo(`Announcement stream error: ${err.code} ${err.message}`);
    });

    const voteStream = votingClient.StreamVoteResults({ user_id: userId });
    voteStream.on("data", (data: any) => {
      const printable = (data.results ?? [])
        .map((r: any) => `${r.song_title}:${r.total_votes}`)
        .join(", ");
      ui.voteSummary = printable || "Belum ada data vote";
      scheduleRender();
    });
    voteStream.on("error", (err: grpc.ServiceError) => {
      setInfo(`Vote stream error: ${err.code} ${err.message}`);
    });

    streams = { voteStream, announcementStream };
  };

  process.on("SIGINT", () => {
    clearScreen();
    console.log("Menutup client...");
    closeAll();
    process.exit(0);
  });

  const register = async (): Promise<void> => {
    render();
    const username = await ask("Username:");
    if (!username) {
      setInfo("Username tidak boleh kosong");
      return;
    }

    if (users.has(username)) {
      setInfo("Username sudah dipakai");
      return;
    }

    const password = await ask("Password:");
    if (!password) {
      setInfo("Password tidak boleh kosong");
      return;
    }

    const roleInput = (await ask("Role (penonton/panitia):")).toLowerCase();
    if (roleInput !== "penonton" && roleInput !== "panitia") {
      setInfo("Role tidak valid");
      return;
    }

    users.set(username, { username, password, role: roleInput });
    setInfo(`Register berhasil: ${username} (${roleInput})`);
  };

  const login = async (): Promise<void> => {
    render();
    const username = await ask("Username:");
    const password = await ask("Password:");

    const user = users.get(username);
    if (!user || user.password !== password) {
      setInfo("Username/password salah");
      return;
    }

    session = { username: user.username, role: user.role };

    if (session.role === "penonton") {
      startPenontonStreams(session.username);
      setInfo(
        `Login sukses sebagai ${session.username} (penonton). Stream aktif.`,
      );
      return;
    }

    cleanupStreams();
    setInfo(`Login sukses sebagai ${session.username} (panitia).`);
  };

  const checkAvailability = async (): Promise<void> => {
    const res = await unaryCall<any, any>(
      ticketClient,
      "CheckAvailability",
      {},
    );
    setInfo(formatResult("CheckAvailability", res));
  };

  const buyTicket = async (): Promise<void> => {
    if (!session) {
      return;
    }

    render();
    const seatNumber = (await ask("Nomor kursi (contoh A1):")).toUpperCase();
    if (!seatNumber) {
      setInfo("Nomor kursi wajib diisi");
      return;
    }

    const res = await unaryCall<any, any>(ticketClient, "BuyTicket", {
      user_id: session.username,
      seat_number: seatNumber,
    });
    setInfo(formatResult("BuyTicket", res));
  };

  const submitVote = async (): Promise<void> => {
    if (!session) {
      return;
    }

    render();
    const songTitle = await ask("Judul lagu:");
    if (!songTitle) {
      setInfo("Judul lagu wajib diisi");
      return;
    }

    const res = await unaryCall<any, any>(votingClient, "SubmitVote", {
      user_id: session.username,
      song_title: songTitle,
    });
    setInfo(formatResult("SubmitVote", res));
  };

  const pushAnnouncement = async (): Promise<void> => {
    if (!session) {
      return;
    }

    render();
    const title = await ask("Judul announcement:");
    const message = await ask("Isi announcement:");
    if (!title || !message) {
      setInfo("Judul dan isi announcement wajib diisi");
      return;
    }

    const res = await unaryCall<any, any>(
      announcementClient,
      "PushAnnouncement",
      {
        announcer_id: session.username,
        announcer_role: session.role,
        title,
        message,
      },
    );
    setInfo(formatResult("PushAnnouncement", res));
  };

  const logout = (): void => {
    cleanupStreams();
    session = null;
    setInfo("Logout berhasil");
  };

  scheduleRender();

  while (true) {
    try {
      render();
      const choice = await ask("Pilih menu:", true);

      if (!session) {
        if (choice === "1") {
          await register();
        } else if (choice === "2") {
          await login();
        } else if (choice === "0") {
          closeAll();
          process.exit(0);
        } else {
          setInfo("Menu tidak valid");
        }
        continue;
      }

      const currentSession = session as ActiveSession;

      if (currentSession.role === "penonton") {
        if (choice === "1") {
          await checkAvailability();
        } else if (choice === "2") {
          await buyTicket();
        } else if (choice === "3") {
          await submitVote();
        } else if (choice === "4") {
          logout();
        } else if (choice === "0") {
          closeAll();
          process.exit(0);
        } else {
          setInfo("Menu tidak valid");
        }
        continue;
      }

      if (choice === "1") {
        await pushAnnouncement();
      } else if (choice === "2") {
        logout();
      } else if (choice === "0") {
        closeAll();
        process.exit(0);
      } else {
        setInfo("Menu tidak valid");
      }
    } catch (err) {
      const grpcError = err as grpc.ServiceError;
      setInfo(`Error: ${grpcError.code ?? "-"} ${grpcError.message ?? err}`);
    }
  }
}

runInteractiveClient().catch((err) => {
  console.error("Interactive client failed:", err);
  process.exit(1);
});
