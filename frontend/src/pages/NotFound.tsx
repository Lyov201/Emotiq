import { Link } from "react-router"
import { ROUTES } from "../constants/routes"

export const NotFound = () => (
  <main className="entry-page">
    <h1>Page not found</h1>
    <Link to={ROUTES.HOME}>Go home</Link>
  </main>
)
