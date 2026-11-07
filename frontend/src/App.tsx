import { useEffect } from "react"
import { Outlet } from "react-router"
import { useAppDispatch, useAppSelector } from "./app/hooks"
import { useRestoreSessionQuery } from "./features/auth/authApi"
import { finishSessionCheck, setCredentials } from "./features/auth/authSlice"

export const App = () => {
  const dispatch = useAppDispatch()
  const sessionChecked = useAppSelector(state => state.auth.sessionChecked)
  const session = useRestoreSessionQuery(undefined, { skip: sessionChecked })

  useEffect(() => {
    if (sessionChecked) return
    if (session.data) {
      dispatch(setCredentials(session.data))
      dispatch(finishSessionCheck())
    } else if (session.isError) {
      dispatch(finishSessionCheck())
    }
  }, [dispatch, session.data, session.isError, sessionChecked])

  if (!sessionChecked) {
    if (session.isError) {
      return (
        <main className="entry-page">
          <p role="alert">Unable to check your session.</p>
        </main>
      )
    }
    return (
      <main className="entry-page">
        <output>Opening your space…</output>
      </main>
    )
  }

  return <Outlet />
}
