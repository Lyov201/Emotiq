export type User = {
  id: string
  name: string
  email: string
}

export type LoginRequest = {
  email: string
  password: string
}

export type LoginResponse = {
  success: boolean
  message: string
  data: {
    user: User
    accessToken: string
    expiresIn: number
  }
}

export type RegisterRequest = {
  name: string
  email: string
  password: string
}

export type RegisterResponse = {
  success: boolean
  message: string
  data: {
    user: User
  }
}