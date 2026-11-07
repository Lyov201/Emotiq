import { ERROR_MESSAGES } from "../constants/errors"

const SERVER_ERROR_STATUS = 500

export const getApiErrorMessage = (error: unknown): string => {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return ERROR_MESSAGES.DEFAULT
  }

  if (error.status === "FETCH_ERROR") return ERROR_MESSAGES.NETWORK
  if (error.status === "TIMEOUT_ERROR") return ERROR_MESSAGES.TIMEOUT

  if (typeof error.status !== "number") return ERROR_MESSAGES.DEFAULT
  if (error.status >= SERVER_ERROR_STATUS) return ERROR_MESSAGES.SERVER

  if ("data" in error) {
    const data = error.data
    if (
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string" &&
      data.message.trim()
    ) {
      return data.message
    }
  }

  return ERROR_MESSAGES.DEFAULT
}
