export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export const unauthorized = (msg = "로그인이 필요해요") => new AppError(401, "UNAUTHORIZED", msg);
export const forbidden = (msg = "권한이 없어요") => new AppError(403, "FORBIDDEN", msg);
export const notFound = (msg = "방송을 찾을 수 없어요") => new AppError(404, "NOT_FOUND", msg);
export const conflict = (code: string, msg: string) => new AppError(409, code, msg);
export const badRequest = (code: string, msg: string) => new AppError(400, code, msg);
