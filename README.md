# Live Concert & Event Management System (gRPC Simpel)

Project ini adalah simulasi sistem konser real-time berbasis gRPC dengan 3 service inti:

- Ticket Service
- Voting Service
- Announcement Service

Implementasi menggunakan TypeScript, Node.js, dan in-memory state di sisi server.

## Fitur Utama

- Unary RPC:
  - BuyTicket
  - CheckAvailability
  - SubmitVote
  - PushAnnouncement
- Server Streaming RPC:
  - StreamVoteResults
  - StreamAnnouncements
- Multi-client demo:
  - Client Penonton
  - Client Panitia
- Error handling per service sesuai spesifikasi.

## Struktur Proyek

```text
live-concert-grpc/
├── proto/
│   ├── ticket.proto
│   ├── voting.proto
│   └── announcement.proto
├── src/
│   ├── server/
│   │   ├── index.ts
│   │   ├── state/
│   │   │   └── store.ts
│   │   └── services/
│   │       ├── ticket.service.ts
│   │       ├── voting.service.ts
│   │       └── announcement.service.ts
│   └── client/
│       ├── penonton.client.ts
│       └── panitia.client.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Prasyarat

- Node.js v18 atau lebih baru
- npm

## Instalasi

```bash
npm install
```

## Menjalankan Aplikasi

### 1. Jalankan server

```bash
npm run dev
```

Default server:

- Host: 0.0.0.0
- Port: 50051
- Voting: OPEN (default)

Opsional env server:

- PORT (default 50051)
- VOTING_OPEN (default true)

Contoh:

```bash
VOTING_OPEN=false npm run dev
```

### 2. Jalankan client penonton

Buka terminal baru:

```bash
npm run client:penonton
```

### 2b. Jalankan client interaktif (disarankan)

Client interaktif menyediakan:

- Register user
- Login user
- Pemilihan role (penonton/panitia)
- Menu dinamis sesuai role

```bash
npm run client:interactive
```

Akun default:

- penonton-01 / 12345
- panitia-01 / 12345

Client ini akan:

- Subscribe stream announcement
- Subscribe stream hasil voting
- CheckAvailability
- BuyTicket
- SubmitVote

Env opsional penonton:

- SERVER_ADDRESS (default localhost:50051)
- USER_ID (default penonton-01)
- SEAT_NUMBER (default A1)
- SONG_TITLE (default Laskar Pelangi)

Contoh:

```bash
USER_ID=penonton-02 SEAT_NUMBER=A2 SONG_TITLE="Separuh Aku" npm run client:penonton
```

### 3. Jalankan client panitia

Buka terminal baru:

```bash
npm run client:panitia
```

Client ini akan memanggil PushAnnouncement.

Env opsional panitia:

- SERVER_ADDRESS (default localhost:50051)
- ANNOUNCER_ID (default panitia-01)
- ANNOUNCER_ROLE (default panitia)
- ANNOUNCEMENT_TITLE (default Info Konser)
- ANNOUNCEMENT_MESSAGE (default Konser dimulai 15 menit lagi.)

Contoh:

```bash
ANNOUNCEMENT_TITLE="Gate Open" ANNOUNCEMENT_MESSAGE="Gerbang dibuka sekarang" npm run client:panitia
```

## Skenario Uji End-to-End

1. Jalankan server (`npm run dev`)
2. Jalankan satu penonton (`npm run client:penonton`)
3. Jalankan panitia (`npm run client:panitia`)
4. Verifikasi di terminal penonton muncul announcement real-time

## Skenario Uji Error Handling

### Ticket Service

- ALREADY_EXISTS:
  - Jalankan dua client penonton dengan SEAT_NUMBER yang sama
- RESOURCE_EXHAUSTED:
  - Isi kursi sampai habis (total 20), lalu coba beli lagi

### Voting Service

- FAILED_PRECONDITION:
  - Start server dengan `VOTING_OPEN=false`, lalu submit vote
- ALREADY_EXISTS:
  - User yang sama submit vote lebih dari sekali

### Announcement Service

- UNAUTHENTICATED:
  - Jalankan panitia dengan `ANNOUNCER_ROLE=penonton`
- UNAVAILABLE:
  - Panggil panitia saat tidak ada penonton yang subscribe stream announcement

## Scripts NPM

- `npm run build`: compile TypeScript
- `npm run dev`: jalankan server dengan nodemon + ts-node
- `npm run start`: jalankan hasil build dari dist
- `npm run client:interactive`: jalankan client terminal interaktif (register/login/menu role)
- `npm run client:penonton`: jalankan client penonton
- `npm run client:panitia`: jalankan client panitia

## Status Requirement

- Minimal 3 service: terpenuhi
- Unary RPC: terpenuhi
- Server streaming RPC: terpenuhi
- Error handling tiap service: terpenuhi
- In-memory state management: terpenuhi
- Multi-client role (penonton/panitia): terpenuhi
