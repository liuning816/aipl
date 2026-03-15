import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import axios from "axios";
import userManager from "../../utils/userManager";
import { ROUTES } from "../../routes";
import "./auth.css";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";

const LoginPage = () => {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/auth/login`, {
        identifier,
        password,
      }, { withCredentials: true });
      if (res.data?.success) {
        userManager.setToken(null);
        userManager.setAuthenticated(true);
        userManager.setUserId(res.data.user?.user_id);
        userManager.setUsername(res.data.user?.username || "");
        userManager.setAvatarUrl(res.data.user?.avatar_url || "");
        userManager.applyAuthHeader(axios);
        navigate(ROUTES.HOME);
      } else {
        setError(res.data?.error || "登录失败");
      }
    } catch (err) {
      if (err?.response?.status === 429) {
        setError("操作过于频繁，请稍后再试");
      } else {
        setError(err?.response?.data?.error || err?.message || "登录失败");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth_wrapper">
      <div className="auth_card">
        <h1>登录</h1>
        <p>使用用户名或邮箱登录后继续</p>
        {error && <div className="auth_error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="auth_field">
            <label>用户名或邮箱</label>
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="请输入用户名或邮箱"
              required
            />
          </div>
          <div className="auth_field">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
              required
            />
          </div>
          <div className="auth_actions">
            <button className="auth_button" type="submit" disabled={loading}>
              {loading ? "登录中..." : "登录"}
            </button>
            <div>
              还没有账号？
              <NavLink className="auth_link" to={ROUTES.REGISTER}>
                去注册
              </NavLink>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
