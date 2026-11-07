import { NavLink, Outlet } from "react-router"
import { ROUTES } from "../constants/routes"
import "./DashboardLayout.css"

export const DashboardLayout = () => {
  return (
    <div className="dashboard-layout">
      <aside className="dashboard-sidebar">
        <h2 className="sidebar-brand">emotiq.</h2>

        <nav className="sidebar-nav" aria-label="Main navigation">
          <NavLink
            to={ROUTES.DASHBOARD}
            end
            className={({ isActive }) =>
              isActive ? "sidebar-link active" : "sidebar-link"
            }
          >
            Dashboard
          </NavLink>
          <NavLink
            to={ROUTES.MOODS}
            className={({ isActive }) =>
              isActive ? "sidebar-link active" : "sidebar-link"
            }
          >
            Mood Tracking
          </NavLink>
        </nav>
      </aside>

      <div className="dashboard-content">
        <header className="dashboard-header">
          <p>Your personal space</p>
        </header>

        <div className="dashboard-page">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
