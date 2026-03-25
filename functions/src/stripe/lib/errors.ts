export class SeatExhaustedError extends Error {
  constructor() {
    super('SEAT_EXHAUSTED');
    this.name = 'SeatExhaustedError';
  }
}
