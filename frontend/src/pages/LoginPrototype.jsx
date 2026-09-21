import React from "react";
import "../styles/login.css";
import { loginUser } from "../api.js";

const featureItems = [
  "Template-safe workflow",
  "Panel assets in one place",
  "Photoshop restore ready",
];

export function LoginPrototype({ onLogin }) {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [remember, setRemember] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState("请输入账号和密码登录设计工作台。");

  const canSubmit = username.trim().length > 0 && password.trim().length > 0;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) {
      setMessage("请先填写用户名和密码。");
      return;
    }

    setIsSubmitting(true);
    setMessage("正在验证登录信息...");
    try {
      const auth = await loginUser(username.trim(), password, remember);
      onLogin(auth);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败，请稍后再试。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-hero" aria-label="SDS Design login">
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
            <p>SDS Design login</p>
            <h2>Welcome back</h2>
          </div>

          <label className="login-field">
            <span>Username</span>
            <input
              type="text"
              autoComplete="username"
              placeholder="designer@sds.local"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>

          <label className="login-field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <div className="login-options">
            <label>
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
              Keep me signed in
            </label>
            <button type="button" className="text-button">
              Forgot password
            </button>
          </div>

          <button className="login-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "登录中..." : "进入设计工作台"}
          </button>

          <p className="login-message" role="status">
            {message}
          </p>
        </form>
      </section>
    </main>
  );
}
