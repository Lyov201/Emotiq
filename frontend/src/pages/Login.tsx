import { useState } from "react"
import { useForm } from "react-hook-form"
import { Link, useLocation } from "react-router"
import { useAppDispatch } from "../app/hooks"
import { useLoginMutation } from "../features/auth/authApi"
import { getApiErrorMessage } from "../utils/getApiErrorMessage"
import { setCredentials } from "../features/auth/authSlice"

import "./Login.css"

type LoginFormValues = {
  email: string
  password: string
}

export const Login = () => {
  const location = useLocation()
  const [showPassword, setShowPassword] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>()

  const [login, { isLoading, isError, isSuccess, error }] = useLoginMutation()
  const dispatch = useAppDispatch()

  const onSubmit = async (data: LoginFormValues) => {
    const result = await login(data)

    if (result.data) {
      const { user, accessToken } = result.data.data
      dispatch(setCredentials({ user, accessToken }))
    }
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
          <span className="eyebrow">YOUR WELLNESS JOURNEY CONTINUES</span>
          <h2 id="login-title">
            Welcome back
            <br />
            to Emotiq
          </h2>
          <p className="login-subtitle">Sign in to continue your journey.</p>

          <form
            className="login-form"
            onSubmit={handleSubmit(onSubmit)}
            aria-busy={isSubmitting || isLoading}
          >
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
                  autoComplete="current-password"
                  placeholder="Enter your password"
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
            {location.state?.registered && (
              <output className="form-message message-success">
                Account created. Log in to continue.
              </output>
            )}
            {isError && (
              <p className="form-message message-error" role="alert">
                {getApiErrorMessage(error)}
              </p>
            )}
            {isSuccess && (
              <output className="form-message message-success">
                Login successful.
              </output>
            )}
            <button
              className="button-primary"
              type="submit"
              disabled={isSubmitting || isLoading}
            >
              {isLoading ? "Logging in..." : "Log in"}
              <span aria-hidden="true">→</span>
            </button>
          </form>
          <p className="register-prompt">
            New to Emotiq?{" "}
            <Link to="/register">
              Create an account <span aria-hidden="true">↗</span>
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
