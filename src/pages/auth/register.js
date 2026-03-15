import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import axios from "axios";
import userManager from "../../utils/userManager";
import { ROUTES } from "../../routes";
import "./auth.css";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";

const RegisterPage = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/auth/register`, {
        username,
        email,
        password,
      }, { withCredentials: true });
      if (res.data?.success) {
        userManager.setToken(null);
        userManager.setAuthenticated(true);
        userManager.setUserId(res.data.user?.user_id);
        userManager.setUsername(res.data.user?.username || username || "");
        userManager.setAvatarUrl(res.data.user?.avatar_url || "");
        userManager.applyAuthHeader(axios);
        navigate(ROUTES.HOME);
      } else {
        setError(res.data?.error || "注册失败");
      }
    } catch (err) {
      if (err?.response?.status === 429) {
        setError("操作过于频繁，请稍后再试");
      } else {
        setError(err?.response?.data?.error || err?.message || "注册失败");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth_wrapper">
      <div className="auth_card">
        <h1>注册</h1>
        <p>创建账号后即可使用全部功能</p>
        {error && <div className="auth_error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="auth_field">
            <label>用户名</label>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="3-32位字母/数字/下划线"
              required
            />
          </div>
          <div className="auth_field">
            <label>邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="请输入邮箱"
              required
            />
          </div>
          <div className="auth_field">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少8位，包含字母和数字"
              required
            />
          </div>
          <div className="auth_actions">
            <button className="auth_button" type="submit" disabled={loading}>
              {loading ? "注册中..." : "注册"}
            </button>
            <div>
              已有账号？
              <NavLink className="auth_link" to={ROUTES.LOGIN}>
                去登录
              </NavLink>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RegisterPage;
