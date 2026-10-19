/**
 * A failure the caller can act on. `app.ts` turns it into `{ error: { code, message } }` with
 * `statusCode`; anything else becomes a 500. Services throw it so they never touch HTTP types.
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (code: string, message: string) => new AppError(404, code, message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const unprocessable = (code: string, message: string) => new AppError(422, code, message);
