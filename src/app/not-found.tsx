import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main-content" className="participant-main">
      <h1>Page not found</h1>
      <Link className="button primary" href="/login">
        Return to sign in
      </Link>
    </main>
  );
}
