import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"
import { API_BASE_URL } from "../constants/api"
import type { RootState } from "../app/store"

export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL,
    credentials: "include",
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.accessToken

      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`)
      }

      return headers
    },
  }),
  endpoints: () => ({}),
})
