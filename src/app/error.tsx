"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="participant-main">
      <h1>We couldn’t load this page.</h1>
      <p>
        Your saved competition records remain in the database. Try loading the
        page again.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
