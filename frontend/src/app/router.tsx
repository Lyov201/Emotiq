import { createBrowserRouter } from "react-router"
import { App } from "../App"
import { ROUTES } from "../constants/routes"
import { ProtectedLayout, PublicLayout } from "../layouts/AuthLayouts"
import { Dashboard } from "../pages/Dashboard"
import { Login } from "../pages/Login"
import { NotFound } from "../pages/NotFound"
import { Register } from "../pages/Register"
import { Welcome } from "../pages/Welcome"
import { DashboardLayout } from "../layouts/DashboardLayout"
import { MoodTracking } from "../pages/MoodTracking"

export const router = createBrowserRouter([
  {
    path: ROUTES.HOME,
    Component: App,
    children: [
      {
        Component: PublicLayout,
        children: [
          { index: true, Component: Welcome },
          { path: ROUTES.LOGIN, Component: Login },
          { path: ROUTES.REGISTER, Component: Register },
        ],
      },
      {
        Component: ProtectedLayout,
        children: [
          {
            Component: DashboardLayout,
            children: [
              { path: ROUTES.DASHBOARD, Component: Dashboard },
              {path: ROUTES.MOODS, Component: MoodTracking},
            ]

          }
        ],
      },
      { path: ROUTES.NOT_FOUND, Component: NotFound },
    ],
  },
])
