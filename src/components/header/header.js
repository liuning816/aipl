import { NavLink, useNavigate } from "react-router-dom";
import axios from "axios";
import "./header.css";
import { CircleUser, Home, FileWarning, RotateCcw, LogOut, BookOpen } from "lucide-react";
import userManager from "../../utils/userManager";
import { ROUTES } from "../../routes";
import { useEffect, useState } from "react";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";

const Header = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      userManager.applyAuthHeader(axios);
      await axios.post(`${API_BASE}/api/auth/logout`, {}, { withCredentials: true });
    } catch (err) {
      // ignore logout errors
    } finally {
      userManager.clearAuth();
      navigate("/login");
    }
  };
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;
    // Attempt to query admin status; backend returns {success:true,data:{is_admin:true,...}}
    const fetchStatus = async () => {
      try {
        userManager.applyAuthHeader(axios);
        const res = await axios.get(`${process.env.REACT_APP_API_URL || "http://localhost:5000"}/api/admin/status`, { withCredentials: true });
        const ok = res?.data?.data?.is_admin;
        if (mounted) setIsAdmin(Boolean(ok));
      } catch (e) {
        if (mounted) setIsAdmin(false);
      }
    };
    fetchStatus();
    return () => { mounted = false; };
  }, []);

  return (
    <header>
      <img src="logo.png" alt="LearnX" height={40} className="logo" />
      <div className="nav-actions">
        <NavLink to={ROUTES.HOME} className={"nav-icon"} title="主页">
          <Home size={32} strokeWidth={1} color="white" />
        </NavLink>

        {isAdmin ? (
          // 管理员简化导航：题库管理、个人中心、退出
          <>
            <NavLink to={ROUTES.ADMIN_QUESTION_BANK} className={"nav-icon"} title="题库管理">
              <BookOpen size={30} strokeWidth={1} color="white" />
            </NavLink>
            <NavLink to={ROUTES.PROFILE} className={"nav-icon"} title="个人中心">
              <CircleUser size={36} strokeWidth={1} color="white" />
            </NavLink>
            <button type="button" className="nav-icon" title="退出登录" onClick={handleLogout}>
              <LogOut size={30} strokeWidth={1} color="white" />
            </button>
          </>
        ) : (
          // 普通用户导航
          <>
            <NavLink to={ROUTES.QUESTION_BANK} className={"nav-icon"} title="题库">
              <BookOpen size={30} strokeWidth={1} color="white" />
            </NavLink>
            <NavLink to={ROUTES.WRONG} className={"nav-icon"} title="错题集">
              <FileWarning size={30} strokeWidth={1} color="white" />
            </NavLink>
            <NavLink to={ROUTES.REDO} className={"nav-icon"} title="重做列表">
              <RotateCcw size={30} strokeWidth={1} color="white" />
            </NavLink>
            <NavLink to={ROUTES.PROFILE} className={"nav-icon"} title="个人中心">
              <CircleUser size={36} strokeWidth={1} color="white" />
            </NavLink>
            <button type="button" className="nav-icon" title="退出登录" onClick={handleLogout}>
              <LogOut size={30} strokeWidth={1} color="white" />
            </button>
          </>
        )}
      </div>
    </header>
  );
};

export default Header;
