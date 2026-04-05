export interface TicketRecord {
  ticketId: string;
  userId: string;
  seatNumber: string;
  purchasedAtUnix: number;
}

export interface VoteResult {
  songTitle: string;
  totalVotes: number;
}

export interface AnnouncementRecord {
  title: string;
  message: string;
  publishedBy: string;
  publishedAtUnix: number;
}

type VoteSubscriber = (update: {
  results: VoteResult[];
  updatedAtUnix: number;
}) => void;
type AnnouncementSubscriber = (announcement: AnnouncementRecord) => void;

export type BuyTicketStatus = "ok" | "seat_taken" | "sold_out";
export type SubmitVoteStatus = "ok" | "closed" | "already_voted";
export type PushAnnouncementStatus =
  | "ok"
  | "unauthenticated"
  | "no_subscribers";

export class LiveConcertStore {
  private readonly totalSeats: number;

  private ticketCounter = 0;
  private ticketsBySeat = new Map<string, TicketRecord>();

  private votingOpen = false;
  private voteByUser = new Map<string, string>();
  private voteCountBySong = new Map<string, number>();
  private voteSubscribers = new Map<string, VoteSubscriber>();

  private announcements: AnnouncementRecord[] = [];
  private announcementSubscribers = new Map<string, AnnouncementSubscriber>();

  constructor(totalSeats = 20) {
    this.totalSeats = totalSeats;
  }

  getAvailability(): {
    totalSeats: number;
    soldSeats: number;
    availableSeats: number;
  } {
    const soldSeats = this.ticketsBySeat.size;
    return {
      totalSeats: this.totalSeats,
      soldSeats,
      availableSeats: this.totalSeats - soldSeats,
    };
  }

  buyTicket(
    userId: string,
    seatNumber: string,
  ):
    | { status: "ok"; ticket: TicketRecord }
    | { status: Exclude<BuyTicketStatus, "ok"> } {
    if (this.ticketsBySeat.has(seatNumber)) {
      return { status: "seat_taken" };
    }

    if (this.ticketsBySeat.size >= this.totalSeats) {
      return { status: "sold_out" };
    }

    const now = Date.now();
    this.ticketCounter += 1;
    const ticket: TicketRecord = {
      ticketId: `TICKET-${now}-${this.ticketCounter}`,
      userId,
      seatNumber,
      purchasedAtUnix: Math.floor(now / 1000),
    };

    this.ticketsBySeat.set(seatNumber, ticket);
    return { status: "ok", ticket };
  }

  setVotingOpen(isOpen: boolean): void {
    this.votingOpen = isOpen;
  }

  isVotingOpen(): boolean {
    return this.votingOpen;
  }

  submitVote(userId: string, songTitle: string): { status: SubmitVoteStatus } {
    if (!this.votingOpen) {
      return { status: "closed" };
    }

    if (this.voteByUser.has(userId)) {
      return { status: "already_voted" };
    }

    this.voteByUser.set(userId, songTitle);
    const currentCount = this.voteCountBySong.get(songTitle) ?? 0;
    this.voteCountBySong.set(songTitle, currentCount + 1);

    this.broadcastVoteResults();
    return { status: "ok" };
  }

  getVoteResults(): VoteResult[] {
    return Array.from(this.voteCountBySong.entries())
      .map(([songTitle, totalVotes]) => ({ songTitle, totalVotes }))
      .sort(
        (a, b) =>
          b.totalVotes - a.totalVotes || a.songTitle.localeCompare(b.songTitle),
      );
  }

  subscribeVoteResults(subscriberId: string, onUpdate: VoteSubscriber): void {
    this.voteSubscribers.set(subscriberId, onUpdate);
  }

  unsubscribeVoteResults(subscriberId: string): void {
    this.voteSubscribers.delete(subscriberId);
  }

  broadcastVoteResults(): void {
    const payload = {
      results: this.getVoteResults(),
      updatedAtUnix: Math.floor(Date.now() / 1000),
    };

    for (const pushUpdate of this.voteSubscribers.values()) {
      pushUpdate(payload);
    }
  }

  pushAnnouncement(
    announcerId: string,
    announcerRole: string,
    title: string,
    message: string,
  ): { status: PushAnnouncementStatus; announcement?: AnnouncementRecord } {
    if (announcerRole !== "panitia") {
      return { status: "unauthenticated" };
    }

    if (this.announcementSubscribers.size === 0) {
      return { status: "no_subscribers" };
    }

    const announcement: AnnouncementRecord = {
      title,
      message,
      publishedBy: announcerId,
      publishedAtUnix: Math.floor(Date.now() / 1000),
    };

    this.announcements.push(announcement);
    for (const pushToSubscriber of this.announcementSubscribers.values()) {
      pushToSubscriber(announcement);
    }

    return { status: "ok", announcement };
  }

  getAnnouncements(): AnnouncementRecord[] {
    return [...this.announcements];
  }

  subscribeAnnouncements(
    subscriberId: string,
    onUpdate: AnnouncementSubscriber,
  ): void {
    this.announcementSubscribers.set(subscriberId, onUpdate);
  }

  unsubscribeAnnouncements(subscriberId: string): void {
    this.announcementSubscribers.delete(subscriberId);
  }

  getAnnouncementSubscriberCount(): number {
    return this.announcementSubscribers.size;
  }
}

export const store = new LiveConcertStore();
