import { useAppDispatch, useAppSelector } from "../app/hooks"
import { useLogoutMutation } from "../features/auth/authApi"
import { clearCredentials } from "../features/auth/authSlice"
import { api } from "../services/api"
import { getApiErrorMessage } from "../utils/getApiErrorMessage"
import "./Entry.css"

export const Dashboard = () => {
  const user = useAppSelector(state => state.auth.user)
  const dispatch = useAppDispatch()
  const [logout, { isLoading, error }] = useLogoutMutation()

  const handleLogout = async () => {
    const result = await logout()
    if (!result.error) {
      dispatch(clearCredentials())
      dispatch(api.util.resetApiState())
    }
  }

  return (
    <main className="entry-page">
      <section className="entry-card">
        <div className="entry-brand">emotiq.</div>
        <h1>Welcome, {user?.name}.</h1>
        <p className="entry-description">
          Your personal space is ready. Take a moment for yourself.
        </p>
        {error && <p role="alert">{getApiErrorMessage(error)}</p>}
        <button
          className="entry-secondary"
          onClick={handleLogout}
          disabled={isLoading}
        >
          {isLoading ? "Logging out…" : "Log out"}
        </button>
      </section>
    </main>
  )
}
