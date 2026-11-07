import type { PayloadAction } from "@reduxjs/toolkit"
import { createAppSlice } from "../../app/createAppSlice"
import type { User } from "./authTypes"

type AuthState = {
  sessionChecked: boolean
  user: User | null
  accessToken: string | null
}

type AuthCredentials = {
  user: User
  accessToken: string
}

const initialState: AuthState = {
  sessionChecked: false,
  user: null,
  accessToken: null,
}

export const authSlice = createAppSlice({
  name: "auth",
  initialState,
  reducers: {
    finishSessionCheck: state => {
      state.sessionChecked = true
    },
    setCredentials: (state, action: PayloadAction<AuthCredentials>) => {
      state.user = action.payload.user
      state.accessToken = action.payload.accessToken
    },
    clearCredentials: state => {
      state.user = null
      state.accessToken = null
    },
  },
})

export const { setCredentials, clearCredentials, finishSessionCheck } =
  authSlice.actions
