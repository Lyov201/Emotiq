import { Link } from "react-router"
import "./Entry.css"

export const Welcome = () => (
  <main className="entry-page">
    <section className="entry-card" aria-labelledby="welcome-title">
      <div className="entry-brand">emotiq.</div>
      <span className="entry-flower" aria-hidden="true">
        ✳
      </span>
      <p className="entry-eyebrow">A LITTLE SPACE. JUST FOR YOU.</p>
      <h1 id="welcome-title">
        Your space to
        <br />
        feel heard.
      </h1>
      <p className="entry-description">
        Take a breath. Find a moment of calm, reflect on your thoughts, and
        start your emotional wellness journey.
      </p>
      <div className="entry-actions">
        <Link className="entry-primary" to="/register">
          Create an account <span aria-hidden="true">↗</span>
        </Link>
        <Link className="entry-secondary" to="/login">
          Log in
        </Link>
      </div>
      <p className="entry-note">One moment at a time.</p>
    </section>
  </main>
)
