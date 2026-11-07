import { Navigate, Outlet } from "react-router"
import { useAppSelector } from "../app/hooks"
import { ROUTES } from "../constants/routes"

export const PublicLayout = () => {
  const accessToken = useAppSelector(state => state.auth.accessToken)
  return accessToken ? <Navigate to={ROUTES.DASHBOARD} replace /> : <Outlet />
}

export const ProtectedLayout = () => {
  const accessToken = useAppSelector(state => state.auth.accessToken)
  return accessToken ? <Outlet /> : <Navigate to={ROUTES.HOME} replace />
}
