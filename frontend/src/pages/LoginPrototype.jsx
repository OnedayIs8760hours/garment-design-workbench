import React from "react";
import "../styles/login.css";

const featureItems = [
  "Template-safe workflow",
  "Panel assets in one place",
  "Photoshop restore ready",
];

export function LoginPrototype({ onEnterPrototype }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [message, setMessage] = React.useState("Prototype mode. Authentication is not connected yet.");

  const canSubmit = email.trim().length > 0 && password.trim().length > 0;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canSubmit) {
      setMessage("Enter any email and password to preview the app shell.");
      return;
    }
    setMessage("Prototype accepted. Authentication will be wired later.");
    onEnterPrototype();
  };

  return (
    <main className="login-page">
      <section className="login-hero" aria-label="SDS Design login prototype">
        <div className="login-copy">
          <a className="login-brand" href="./" aria-label="SDS Design editor">
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>SDS Design</span>
          </a>

          <div className="login-title-block">
            <p className="login-kicker">Garment customization studio</p>
            <h1>Sign in to your design workspace.</h1>
            <p>
              A quiet entry point for managing garment templates, panel artwork,
              and restoration packages without leaving the browser.
            </p>
          </div>

          <ul className="login-feature-list" aria-label="Workspace highlights">
            {featureItems.map((item) => (
              <li key={item}>
                <span aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <form className="login-panel" onSubmit={handleSubmit}>
          <div className="panel-header">
            <p>Prototype login</p>
            <h2>Welcome back</h2>
          </div>

          <label className="login-field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              placeholder="designer@sds.local"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="login-field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Enter any password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <div className="login-options">
            <label>
              <input type="checkbox" defaultChecked />
              Keep me signed in
            </label>
            <button type="button" className="text-button">
              Forgot password
            </button>
          </div>

          <button className="login-submit" type="submit">
            Enter prototype
          </button>

          <p className="login-message" role="status">
            {message}
          </p>
        </form>
      </section>
    </main>
  );
}
