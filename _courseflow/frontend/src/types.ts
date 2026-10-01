export type Course = { id: number; code: string; title: string; description: string; credits: number; prerequisites: string[] };
export type Meeting = { day: string; start: string; end: string };
export type Section = { id: number; courseCode: string; crn: string; term?: string; instructor: string; capacity: number; availableSeats: number; seatsCheckedAt?: string; meetings: Meeting[] };
export type Schedule = { score: number; warnings: string[]; sections: Section[] };
export type ApiError = { error?: string; details?: string[] };
