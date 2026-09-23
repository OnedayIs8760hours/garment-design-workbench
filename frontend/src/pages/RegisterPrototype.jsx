import React from "react";
import "../styles/login.css";
import { registerUser } from "../api.js";

const featureItems = [
  "Template-safe workflow",
  "Panel assets in one place",
  "Photoshop restore ready",
];

export function RegisterPrototype({ onBackToLogin, initialUsername = "" }) {
  const [username, setUsername] = React.useState(initialUsername);
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [jobTitle, setJobTitle] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState("创建一个新账号，开始管理你的设计资产。");

  const canSubmit =
    username.trim().length > 0 && password.length >= 8 && confirmPassword.length > 0;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!username.trim()) {
      setMessage("请先填写用户名。");
      return;
    }
    if (password.length < 8) {
      setMessage("密码至少需要 8 位字符。");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("两次输入的密码不一致。");
      return;
    }

    setIsSubmitting(true);
    setMessage("正在创建账号...");
    try {
      await registerUser(username.trim(), password, jobTitle.trim() || null);
      onBackToLogin(username.trim());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "注册失败，请稍后再试。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-hero" aria-label="SDS Design register">
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
            <h1>Create your design workspace.</h1>
            <p>
              Set up a new account to manage garment templates, panel artwork,
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
            <p>SDS Design register</p>
            <h2>Get started</h2>
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
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <label className="login-field">
            <span>Confirm password</span>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Enter your password again"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>

          <label className="login-field">
            <span>Job title (optional)</span>
            <input
              type="text"
              autoComplete="organization-title"
              placeholder="e.g. Apparel designer"
              value={jobTitle}
              onChange={(event) => setJobTitle(event.target.value)}
            />
          </label>

          <button className="login-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "注册中..." : "创建账号"}
          </button>

          <div className="login-options">
            <span>已有账号？</span>
            <button type="button" className="text-button" onClick={() => onBackToLogin(username.trim())}>
              返回登录
            </button>
          </div>

          <p className="login-message" role="status">
            {message}
          </p>
        </form>
      </section>
    </main>
  );
}
