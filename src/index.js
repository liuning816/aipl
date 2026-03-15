import React, { useState, useEffect } from "react";
import { RouterProvider, createBrowserRouter, Navigate } from "react-router-dom";
import ReactDOM from "react-dom/client";
import "./index.css";
import { TopicPage, RoadmapPage, QuizPage, ProfilePage, UserprofilePage, WrongPage, RedoPage, RedoPlayPage, LoginPage, RegisterPage, SettingsPage, QuestionBankPage, AdminQuestionBank } from "./pages/index";
import { ROUTES } from './routes';
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import userManager from "./utils/userManager";
import axios from "axios";
import FloatingTools from "./components/floatingTools/floatingTools";

const RequireAuth = ({ children }) => {
  if (!userManager.isAuthenticated()) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }
  return children;
};

const RequireAdmin = ({ children }) => {
  const [status, setStatus] = useState('loading');
  useEffect(() => {
    if (!userManager.isAuthenticated()) {
      setStatus('noauth');
      return;
    }
    userManager.applyAuthHeader(axios);
    axios.get('/api/admin/status', { withCredentials: true }).then((res) => {
      const ok = res.data?.data?.is_admin;
      setStatus(ok ? 'ok' : 'forbidden');
    }).catch(() => setStatus('forbidden'));
  }, []);

  if (status === 'loading') return <div style={{padding:20}}>加载中...</div>;
  if (status === 'noauth') return <Navigate to={ROUTES.LOGIN} replace />;
  if (status === 'forbidden') return <Navigate to={ROUTES.HOME} replace />;
  return children;
};

const GuestOnly = ({ children }) => {
  if (userManager.isAuthenticated()) {
    return <Navigate to={ROUTES.HOME} replace />;
  }
  return children;
};

const WithFloatingTools = ({ children }) => (
  <>
    <div className="page-shell">
      {children}
    </div>
    <FloatingTools />
  </>
);

const router = createBrowserRouter([
  {
    path: ROUTES.HOME,
    element: (
      <RequireAuth>
        <WithFloatingTools>
          <ProfilePage />
        </WithFloatingTools>
      </RequireAuth>
    ),
  },
  {
    path: ROUTES.LOGIN,
    element: (
      <GuestOnly>
        <WithFloatingTools>
          <LoginPage />
        </WithFloatingTools>
      </GuestOnly>
    ),
  },
  {
    path: ROUTES.REGISTER,
    element: (
      <GuestOnly>
        <WithFloatingTools>
          <RegisterPage />
        </WithFloatingTools>
      </GuestOnly>
    ),
  },
  {
    path: ROUTES.PROFILE,
    element: (
      <RequireAuth>
        <WithFloatingTools>
          <UserprofilePage />
        </WithFloatingTools>
      </RequireAuth>
    ),
  },
  {
    path: ROUTES.SETTINGS,
    element: (
      <RequireAuth>
        <WithFloatingTools>
          <SettingsPage />
        </WithFloatingTools>
      </RequireAuth>
    ),
  },
  {
    path: "/test",
    element: (
      <WithFloatingTools>
        <App></App>
      </WithFloatingTools>
    ),
  },
  {
    path: ROUTES.ROADMAP + '/',
    element: (
      <RequireAuth>
        <WithFloatingTools>
          <RoadmapPage />
        </WithFloatingTools>
      </RequireAuth>
    ),
  },
  {
    path: ROUTES.QUIZ + '/',
    element: (
      <RequireAuth>
        <WithFloatingTools>
          <QuizPage />
        </WithFloatingTools>
      </RequireAuth>
    ),
  },
  {
    path: ROUTES.TOPIC + '/',
    element: (
      <RequireAuth>
        <WithFloatingTools>
          <TopicPage />
        </WithFloatingTools>
      </RequireAuth>
    ),
  },
  {
    path: ROUTES.WRONG + '/',
    element: (
      <RequireAuth>
        <WithFloatingTools>
          <WrongPage />
        </WithFloatingTools>
      </RequireAuth>
    ),
  },
  {
    path: ROUTES.REDO + '/',
    element: (
      <RequireAuth>
        <WithFloatingTools>
          <RedoPage />
        </WithFloatingTools>
      </RequireAuth>
    ),
  },
  {
    path: ROUTES.REDO_PLAY + '/',
    element: (
      <RequireAuth>
        <WithFloatingTools>
          <RedoPlayPage />
        </WithFloatingTools>
      </RequireAuth>
    ),
  },
  {
    path: ROUTES.QUESTION_BANK + '/',
    element: (
      <RequireAuth>
        <WithFloatingTools>
          <QuestionBankPage />
        </WithFloatingTools>
      </RequireAuth>
    ),
  },
  {
    path: ROUTES.ADMIN_QUESTION_BANK + '/',
    element: (
      <RequireAdmin>
        <WithFloatingTools>
          <AdminQuestionBank />
        </WithFloatingTools>
      </RequireAdmin>
    ),
  },
]);

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
