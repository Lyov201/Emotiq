import { useAppDispatch, useAppSelector } from "../app/hooks"
import { useLogoutMutation } from "../features/auth/authApi"
import { clearCredentials } from "../features/auth/authSlice"
import { api } from "../services/api"
import { getApiErrorMessage } from "../utils/getApiErrorMessage"
import "./Dashboard.css"

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
    <main className="dashboard-home">
      <section className="dashboard-welcome" aria-labelledby="dashboard-title">
        <h1 id="dashboard-title">Welcome, {user?.name}.</h1>
        <p className="dashboard-description">
          Your personal space is ready. Take a moment for yourself.
        </p>
        {error && (
          <p className="dashboard-error" role="alert">
            {getApiErrorMessage(error)}
          </p>
        )}
        <button
          className="dashboard-logout"
          onClick={handleLogout}
          disabled={isLoading}
        >
          {isLoading ? "Logging out…" : "Log out"}
        </button>
      </section>
    </main>
  )
}
