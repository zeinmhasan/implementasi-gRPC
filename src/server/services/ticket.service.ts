import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";

import { store } from "../state/store";

interface BuyTicketRequest {
  user_id: string;
  seat_number: string;
}

interface BuyTicketResponse {
  success: boolean;
  message: string;
  ticket_id: string;
  seat_number: string;
  user_id: string;
}

interface CheckAvailabilityRequest {}

interface CheckAvailabilityResponse {
  total_seats: number;
  sold_seats: number;
  available_seats: number;
}

function buyTicket(
  call: ServerUnaryCall<BuyTicketRequest, BuyTicketResponse>,
  callback: sendUnaryData<BuyTicketResponse>,
): void {
  const userId = (call.request.user_id ?? "").trim();
  const seatNumber = (call.request.seat_number ?? "").trim().toUpperCase();

  if (!userId || !seatNumber) {
    callback({
      code: status.INVALID_ARGUMENT,
      message: "user_id and seat_number are required",
    });
    return;
  }

  const result = store.buyTicket(userId, seatNumber);

  if (result.status === "seat_taken") {
    callback({
      code: status.ALREADY_EXISTS,
      message: `Seat ${seatNumber} is already taken`,
    });
    return;
  }

  if (result.status === "sold_out") {
    callback({
      code: status.RESOURCE_EXHAUSTED,
      message: "Tickets are sold out",
    });
    return;
  }

  if (result.status !== "ok") {
    callback({
      code: status.INTERNAL,
      message: "Unexpected ticket purchase status",
    });
    return;
  }

  callback(null, {
    success: true,
    message: "Ticket purchased successfully",
    ticket_id: result.ticket.ticketId,
    seat_number: result.ticket.seatNumber,
    user_id: result.ticket.userId,
  });
}

function checkAvailability(
  _call: ServerUnaryCall<CheckAvailabilityRequest, CheckAvailabilityResponse>,
  callback: sendUnaryData<CheckAvailabilityResponse>,
): void {
  const availability = store.getAvailability();
  callback(null, {
    total_seats: availability.totalSeats,
    sold_seats: availability.soldSeats,
    available_seats: availability.availableSeats,
  });
}

export const ticketServiceHandlers = {
  BuyTicket: buyTicket,
  CheckAvailability: checkAvailability,
};
