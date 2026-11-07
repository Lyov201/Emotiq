import { api } from "../../services/api"
import type {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  User,
} from "./authTypes"

const AUTH_ENDPOINTS = {
  LOGIN: "/auth/login",
  REGISTER: "/auth/register",
  REFRESH: "/auth/refresh",
  ME: "/auth/me",
  LOGOUT: "/auth/logout",
} as const
const CSRF_HEADERS = { "X-CSRF-Protection": "1" }

type Session = { user: User; accessToken: string }
type RefreshResponse = { data: { accessToken: string; expiresIn: number } }
type MeResponse = { data: { user: User } }

export const authApi = api.injectEndpoints({
  endpoints: builder => ({
    register: builder.mutation<RegisterResponse, RegisterRequest>({
      query: data => ({
        url: AUTH_ENDPOINTS.REGISTER,
        method: "POST",
        headers: CSRF_HEADERS,
        body: data,
      }),
    }),
    login: builder.mutation<LoginResponse, LoginRequest>({
      query: credentials => ({
        url: AUTH_ENDPOINTS.LOGIN,
        method: "POST",
        headers: CSRF_HEADERS,
        body: credentials,
      }),
    }),
    restoreSession: builder.query<Session, void>({
      async queryFn(_arg, _queryApi, _extraOptions, baseQuery) {
        const refresh = await baseQuery({
          url: AUTH_ENDPOINTS.REFRESH,
          method: "POST",
          headers: CSRF_HEADERS,
        })
        if (refresh.error) return { error: refresh.error }
        const { accessToken } = (refresh.data as RefreshResponse).data
        const me = await baseQuery({
          url: AUTH_ENDPOINTS.ME,
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (me.error) return { error: me.error }
        return {
          data: { user: (me.data as MeResponse).data.user, accessToken },
        }
      },
    }),
    logout: builder.mutation<void, void>({
      query: () => ({
        url: AUTH_ENDPOINTS.LOGOUT,
        method: "POST",
        headers: CSRF_HEADERS,
      }),
    }),
  }),
})

export const {
  useLoginMutation,
  useRegisterMutation,
  useRestoreSessionQuery,
  useLogoutMutation,
} = authApi
