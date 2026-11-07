import { Navigate, Route, Routes } from "react-router"
import { Login } from "./pages/Login"
import { Register } from "./pages/Register"

export const App = () => (
  <Routes>
    <Route path="/" element={<Navigate to="/login" replace />} />
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route
      path="*"
      element={
        <main>
          <h1>Page not found</h1>
        </main>
      }
    />
  </Routes>
)
