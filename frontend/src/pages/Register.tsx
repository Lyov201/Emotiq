import { useState } from "react"
import { useForm } from "react-hook-form"
import { Link, useNavigate } from "react-router"
import { useRegisterMutation } from "../features/auth/authApi"
import { getApiErrorMessage } from "../utils/getApiErrorMessage"
import type { RegisterRequest } from "../features/auth/authTypes"
import { AUTH_VALIDATION } from "../constants/auth"

import "./Login.css"

export const Register = () => {
  const [showPassword, setShowPassword] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterRequest>()

  const [registerAccount, { isLoading, isError, error }] = useRegisterMutation()
  const navigate = useNavigate()

  const onSubmit = async (data: RegisterRequest) => {
    const result = await registerAccount(data)
    if (result.data)
      navigate("/login", { replace: true, state: { registered: true } })
  }
  return (
    <main className="login-page">
      <section className="login-story" aria-labelledby="story-title">
        <div className="emotiq-brand">
          <span className="brand-symbol" aria-hidden="true">
            e
          </span>
          emotiq<span className="brand-dot">.</span>
        </div>
        <div className="story-copy">
          <span className="eyebrow">A LITTLE SPACE. JUST FOR YOU.</span>
          <h1 id="story-title">
            Your space to
            <br />
            feel heard<span>.</span>
          </h1>
          <p>
            Find a moment of calm, reflect on your thoughts, and continue your
            emotional wellness journey.
          </p>
        </div>
        <div className="calm-art" aria-hidden="true">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-sun" />
          <div className="art-arch arch-back" />
          <div className="art-arch arch-front" />
          <div className="art-ground" />
          <span className="art-note">
            <span />
            One moment at a time.
          </span>
        </div>
        <p className="story-footer">
          A softer place to land. A little room to grow.
        </p>
      </section>

      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-card">
          <div className="welcome-symbol" aria-hidden="true">
            ✳
          </div>
          <span className="eyebrow">YOUR JOURNEY STARTS HERE</span>
          <h2 id="login-title">
            A little space
            <br />
            for you
          </h2>
          <p className="login-subtitle">
            Create an account to begin your journey.
          </p>

          <form
            className="login-form"
            onSubmit={handleSubmit(onSubmit)}
            aria-busy={isSubmitting || isLoading}
          >
            <div className="form-field">
              <label htmlFor="name">Your name</label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                placeholder="How should we call you?"
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "name-error" : undefined}
                {...register("name", {
                  required: "Name is required",
                  setValueAs: (value: string) => value.trim(),
                  minLength: {
                    value: AUTH_VALIDATION.NAME_MIN_LENGTH,
                    message: `Use at least ${AUTH_VALIDATION.NAME_MIN_LENGTH} characters`,
                  },
                  maxLength: {
                    value: AUTH_VALIDATION.NAME_MAX_LENGTH,
                    message: `Use at most ${AUTH_VALIDATION.NAME_MAX_LENGTH} characters`,
                  },
                })}
              />
              {errors.name && (
                <p className="field-error" id="name-error" role="alert">
                  {errors.name.message}
                </p>
              )}
            </div>
            <div className="form-field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "email-error" : undefined}
                {...register("email", { required: "Email is required" })}
              />
              {errors.email && (
                <p className="field-error" id="email-error" role="alert">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="form-field">
              <label htmlFor="password">Password</label>
              <div className="password-field">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Create a password"
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={
                    errors.password ? "password-error" : undefined
                  }
                  {...register("password", {
                    required: "Password is required",
                  })}
                />
                <button
                  className="password-toggle"
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  aria-controls="password"
                  onClick={() => setShowPassword(value => !value)}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    aria-hidden="true"
                  >
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                    <circle cx="12" cy="12" r="3" />
                    {showPassword && <path d="m3 3 18 18" />}
                  </svg>
                </button>
              </div>
              {errors.password && (
                <p className="field-error" id="password-error" role="alert">
                  {errors.password.message}
                </p>
              )}
            </div>
            {isError && (
              <p className="form-message message-error" role="alert">
                {getApiErrorMessage(error)}
              </p>
            )}
            <button
              className="button-primary"
              type="submit"
              disabled={isSubmitting || isLoading}
            >
              {isLoading ? "Creating account..." : "Create account"}
              <span aria-hidden="true">→</span>
            </button>
          </form>
          <p className="register-prompt">
            New for you?{" "}
            <Link to="/login">
              Log in <span aria-hidden="true">↗</span>
            </Link>
          </p>
          <div className="gentle-reminder">
            <span aria-hidden="true">✧</span> You don’t have to have it all
            figured out.
          </div>
        </div>
        <p className="panel-footer">
          A moment for yourself is a good place to start.
        </p>
      </section>
    </main>
  )
}
