export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_FILE_BYTES = 1024 * 1024;
export const PREVIEW_TTL_MS = 10 * 60 * 1000;
export const MAX_PREVIEWS = 50;
export const MAX_HISTORY = 25;
export const TASK_STATUSES = ['next', 'waiting', 'someday'];
export const TASK_HEADINGS = { next: 'Next', waiting: 'Waiting', someday: 'Someday' };
export function localDateStr(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
