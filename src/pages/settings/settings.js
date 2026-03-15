import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Header from "../../components/header/header";
import userManager from "../../utils/userManager";
import { ROUTES } from "../../routes";
import "./settings.css";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";

const isPromptFavorite = (value) => value === true || value === "true" || value === 1 || value === "1";

const SettingsPage = () => {
  const navigate = useNavigate();
  const isAuthenticated = userManager.isAuthenticated();
  const authHeaders = useMemo(
    () => ({ withCredentials: true }),
    []
  );

  const [username, setUsername] = useState(userManager.getUsername() || "");
  const [usernameDraft, setUsernameDraft] = useState(userManager.getUsername() || "");
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(userManager.getAvatarUrl() || "");
  const [bankQuizDefaultCount, setBankQuizDefaultCount] = useState(15);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const avatarInputRef = useRef(null);
  const profileImportInputRef = useRef(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [prompts, setPrompts] = useState([]);
  const [editingPromptId, setEditingPromptId] = useState("");
  const [promptTitle, setPromptTitle] = useState("");
  const [promptDescription, setPromptDescription] = useState("");
  const [promptContent, setPromptContent] = useState("");
  const [promptTagsInput, setPromptTagsInput] = useState("");
  const [promptEnabled, setPromptEnabled] = useState(true);
  const [promptFavorite, setPromptFavorite] = useState(false);
  const [promptSearch, setPromptSearch] = useState("");
  const [promptFilter, setPromptFilter] = useState("all");
  const [showPromptModal, setShowPromptModal] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [statusError, setStatusError] = useState(false);
  const [profileSummary, setProfileSummary] = useState(null);

  const setMessage = (msg, isError = false) => {
    setStatus(msg);
    setStatusError(isError);
  };

  const extractApiErrorMessage = (err, fallbackText) => {
    if (err?.response?.status === 429) {
      return "操作过于频繁，请稍后再试";
    }

    if (err?.response?.status === 401) {
      return "登录状态已失效，请重新登录后再试";
    }
    if (err?.response?.status === 404) {
      return "接口未找到，请重启后端服务后重试";
    }

    const data = err?.response?.data;
    if (typeof data === "string" && data.trim()) {
      return data;
    }
    if (data?.error) {
      return data.error;
    }
    if (err?.message) {
      return `${fallbackText}：${err.message}`;
    }
    return fallbackText;
  };

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const settingsRes = await axios.get(`${API_BASE}/api/user/settings`, authHeaders);
      const settings = settingsRes.data?.settings || {};
      setUsername(settings.username || "");
      setUsernameDraft(settings.username || "");
      setEmail(settings.email || "");
      setAvatarUrl(settings.avatar_url || "");
      setBankQuizDefaultCount(Number(settings.bank_quiz_default_count || 15));

      userManager.setUsername(settings.username || "");
      userManager.setAvatarUrl(settings.avatar_url || "");

      const promptsRes = await axios.get(`${API_BASE}/api/user/prompts`, authHeaders);
      setPrompts(Array.isArray(promptsRes.data?.prompts) ? promptsRes.data.prompts : []);

      try {
        const summaryRes = await axios.get(`${API_BASE}/api/user-profile/summary`, authHeaders);
        setProfileSummary(summaryRes.data?.summary || null);
      } catch (summaryErr) {
        setProfileSummary(null);
      }
    } catch (err) {
      setMessage(extractApiErrorMessage(err, "加载设置失败"), true);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(ROUTES.LOGIN);
      return;
    }
    loadSettings();
  }, [isAuthenticated, navigate, loadSettings]);

  const updateProfile = async (payload, successText = "个人资料已更新") => {
    setSaving(true);
    setMessage("");
    try {
      const res = await axios.put(
        `${API_BASE}/api/user/settings`,
        payload,
        authHeaders
      );
      const user = res.data?.user || {};
      const nextName = user.username || username;
      const nextAvatar = user.avatar_url || avatarUrl;
      const nextBankCount = Number(user.bank_quiz_default_count || bankQuizDefaultCount || 15);
      setUsername(nextName);
      setUsernameDraft(nextName);
      setAvatarUrl(nextAvatar);
      setBankQuizDefaultCount(nextBankCount);
      userManager.setUsername(nextName);
      userManager.setAvatarUrl(nextAvatar);
      setMessage(successText);
    } catch (err) {
      setMessage(extractApiErrorMessage(err, "更新资料失败"), true);
    } finally {
      setSaving(false);
    }
  };

  const saveUsername = async () => {
    if (!usernameDraft.trim()) {
      setMessage("用户名不能为空", true);
      return;
    }
    await updateProfile({ username: usernameDraft.trim() }, "用户名已更新");
    setIsEditingUsername(false);
  };

  const saveBankQuizDefaultCount = async () => {
    const count = Number(bankQuizDefaultCount);
    if (!Number.isInteger(count) || count < 1 || count > 50) {
      setMessage("题库测验默认题量必须是 1-50 的整数", true);
      return;
    }
    await updateProfile({ bank_quiz_default_count: count }, "题库测验默认题量已更新");
  };

  const triggerAvatarPicker = () => {
    if (avatarInputRef.current) avatarInputRef.current.click();
  };

  const onAvatarPicked = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("请选择图片文件", true);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage("图片大小不能超过 2MB", true);
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("avatar", file);

      const res = await axios.post(`${API_BASE}/api/user/avatar`, formData, {
        ...authHeaders,
        headers: {
          ...(authHeaders.headers || {}),
          "Content-Type": "multipart/form-data",
        },
      });

      const user = res.data?.user || {};
      const nextAvatar = user.avatar_url || "";
      const nextName = user.username || username;

      setAvatarUrl(nextAvatar);
      setUsername(nextName);
      setUsernameDraft(nextName);
      userManager.setAvatarUrl(nextAvatar);
      userManager.setUsername(nextName);
      setMessage("头像已更新");
    } catch (err) {
      const statusCode = err?.response?.status;
      const backendMsg = err?.response?.data?.error;
      const fallback = err?.message || "上传头像失败";
      let detailHint = "";

      if (statusCode === 413) {
        detailHint = "文件过大，请选择 2MB 以内图片。";
      } else if (statusCode === 400) {
        detailHint = "文件格式可能不支持，请尝试 png/jpg/webp。";
      } else if (statusCode === 401) {
        detailHint = "登录状态可能已过期，请重新登录后再试。";
      } else if (statusCode >= 500) {
        detailHint = "服务器处理失败，请稍后重试。";
      }

      const reason = backendMsg || fallback;
      const friendly = err?.response?.status === 429
        ? "操作过于频繁，请稍后再试"
        : `上传头像失败：${reason}${detailHint ? ` (${detailHint})` : ""}`;
      setMessage(friendly, true);
    } finally {
      setSaving(false);
    }
    event.target.value = "";
  };

  const savePassword = async () => {
    if (!currentPassword || !newPassword) {
      setPasswordError("请填写当前密码和新密码");
      return;
    }
    setSaving(true);
    setPasswordError("");
    try {
      await axios.put(
        `${API_BASE}/api/user/password`,
        {
          current_password: currentPassword,
          new_password: newPassword,
        },
        authHeaders
      );
      setCurrentPassword("");
      setNewPassword("");
      setShowPasswordModal(false);
      setMessage("密码已更新");
    } catch (err) {
      setPasswordError(extractApiErrorMessage(err, "修改密码失败"));
    } finally {
      setSaving(false);
    }
  };

  const exportProfile = async (format) => {
    const safeFormat = format === "json" ? "json" : "csv";
    setSaving(true);
    setMessage("");
    try {
      const response = await axios.get(`${API_BASE}/api/user-profile/export`, {
        ...authHeaders,
        params: { format: safeFormat },
        responseType: safeFormat === "json" ? "json" : "blob",
      });

      if (safeFormat === "json") {
        const blob = new Blob([JSON.stringify(response.data, null, 2)], {
          type: "application/json;charset=utf-8",
        });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `user_profile_stats_${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(link.href);
      } else {
        const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: "text/csv;charset=utf-8" });
        const disposition = response.headers?.["content-disposition"] || "";
        const match = disposition.match(/filename=([^;]+)/i);
        const filename = match ? match[1].replace(/["']/g, "") : `user_profile_stats_${Date.now()}.csv`;

        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(link.href);
      }

      setMessage(`画像统计特征已导出为 ${safeFormat.toUpperCase()}`);
    } catch (err) {
      setMessage(extractApiErrorMessage(err, "导出统计特征失败"), true);
    } finally {
      setSaving(false);
    }
  };

  const triggerProfileImport = () => {
    if (profileImportInputRef.current) {
      profileImportInputRef.current.click();
    }
  };

  const onProfileImportPicked = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const lower = (file.name || "").toLowerCase();
    const isCsv = lower.endsWith(".csv");
    const isJson = lower.endsWith(".json");
    if (!isCsv && !isJson) {
      setMessage("仅支持导入 .csv 或 .json 文件", true);
      event.target.value = "";
      return;
    }

    if (file.size > 1024 * 1024) {
      setMessage("导入文件不能超过 1MB", true);
      event.target.value = "";
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.post(`${API_BASE}/api/user-profile/import`, formData, authHeaders);

      const rows = res.data?.imported_rows;
      try {
        const summaryRes = await axios.get(`${API_BASE}/api/user-profile/summary`, authHeaders);
        setProfileSummary(summaryRes.data?.summary || null);
      } catch (summaryErr) {
        // Keep import success state even if summary refresh fails.
      }
      setMessage(`导入成功${typeof rows === "number" ? `（${rows} 行）` : ""}，建议刷新画像查看最新结果`);
    } catch (err) {
      setMessage(extractApiErrorMessage(err, "导入统计特征失败"), true);
    } finally {
      setSaving(false);
      event.target.value = "";
    }
  };

  const resetPromptEditor = () => {
    setEditingPromptId("");
    setPromptTitle("");
    setPromptDescription("");
    setPromptContent("");
    setPromptTagsInput("");
    setPromptEnabled(true);
    setPromptFavorite(false);
  };

  const editPrompt = (item) => {
    setEditingPromptId(item.id || "");
    setPromptTitle(item.title || "");
    setPromptDescription(item.description || "");
    setPromptContent(item.content || "");
    setPromptTagsInput(Array.isArray(item.tags) ? item.tags.join(", ") : "");
    setPromptEnabled(item.enabled !== false);
    setPromptFavorite(isPromptFavorite(item.favorite));
    setShowPromptModal(true);
  };

  const openCreatePromptModal = () => {
    resetPromptEditor();
    setShowPromptModal(true);
  };

  const parsePromptTags = () => {
    const parts = (promptTagsInput || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    return Array.from(new Set(parts)).slice(0, 8);
  };

  const savePrompt = async () => {
    if (!promptTitle.trim() || !promptContent.trim()) {
      setMessage("提示词标题和内容不能为空", true);
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await axios.post(
        `${API_BASE}/api/user/prompts`,
        {
          id: editingPromptId || undefined,
          title: promptTitle.trim(),
          description: promptDescription.trim(),
          content: promptContent,
          enabled: promptEnabled,
          favorite: promptFavorite,
          tags: parsePromptTags(),
        },
        authHeaders
      );
      await loadSettings();
      resetPromptEditor();
      setShowPromptModal(false);
      setMessage("提示词已保存");
    } catch (err) {
      setMessage(extractApiErrorMessage(err, "保存提示词失败"), true);
    } finally {
      setSaving(false);
    }
  };

  const deletePrompt = async (id) => {
    if (!id) return;
    if (!window.confirm("确认删除这条提示词吗？")) return;

    setSaving(true);
    setMessage("");
    try {
      await axios.delete(`${API_BASE}/api/user/prompts/${id}`, authHeaders);
      await loadSettings();
      if (editingPromptId === id) resetPromptEditor();
      setMessage("提示词已删除");
    } catch (err) {
      setMessage(extractApiErrorMessage(err, "删除提示词失败"), true);
    } finally {
      setSaving(false);
    }
  };

  const togglePromptFavorite = async (item) => {
    if (!item?.id) return;
    setSaving(true);
    setMessage("");
    try {
      await axios.post(
        `${API_BASE}/api/user/prompts`,
        {
          id: item.id,
          title: item.title || "",
          description: item.description || "",
          content: item.content || "",
          enabled: item.enabled !== false,
          favorite: !isPromptFavorite(item.favorite),
          tags: Array.isArray(item.tags) ? item.tags : [],
        },
        authHeaders
      );
      await loadSettings();
      setMessage(isPromptFavorite(item.favorite) ? "已取消收藏" : "已收藏提示词");
    } catch (err) {
      setMessage(extractApiErrorMessage(err, "更新收藏状态失败"), true);
    } finally {
      setSaving(false);
    }
  };

  const filteredPrompts = useMemo(() => {
    const keyword = (promptSearch || "").trim().toLowerCase();
    return (prompts || [])
      .filter((item) => {
        if (promptFilter === "favorite" && !isPromptFavorite(item.favorite)) return false;
        if (promptFilter === "enabled" && item.enabled === false) return false;
        if (promptFilter === "disabled" && item.enabled !== false) return false;
        if (!keyword) return true;

        const tagsText = Array.isArray(item.tags) ? item.tags.join(" ") : "";
        const blob = `${item.title || ""} ${item.description || ""} ${item.content || ""} ${tagsText}`.toLowerCase();
        return blob.includes(keyword);
      })
      .sort((a, b) => {
        if (isPromptFavorite(a.favorite) && !isPromptFavorite(b.favorite)) return -1;
        if (!isPromptFavorite(a.favorite) && isPromptFavorite(b.favorite)) return 1;
        return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
      });
  }, [prompts, promptSearch, promptFilter]);

  const deleteAccount = async () => {
    if (!deletePassword) {
      setDeleteError("请输入密码以确认注销");
      return;
    }

    setSaving(true);
    setDeleteError("");
    try {
      await axios.post(
        `${API_BASE}/api/user/delete-account`,
        { password: deletePassword },
        authHeaders
      );

      userManager.clearAuth();
      navigate(ROUTES.LOGIN);
    } catch (err) {
      const statusCode = err?.response?.status;
      const backendMsg = err?.response?.data?.error;
      if (statusCode === 401) {
        setDeleteError("当前密码不正确，请重试");
      } else {
        setDeleteError(extractApiErrorMessage(err, backendMsg || "注销失败，请稍后重试"));
      }
    } finally {
      setSaving(false);
    }
  };

  const avatarPreview = avatarUrl || userManager.getAvatarUrl() || "/avatar.jpg";

  return (
    <div className="settings_wrapper">
      <Header />
      <div className="settings_content">
        <div className="settings_header">
          <div>
            <h1>设置</h1>
          </div>
          <button className="btn" onClick={() => navigate(ROUTES.PROFILE)}>返回个人中心</button>
        </div>

        {status ? <div className={`status_line ${statusError ? "error" : ""}`}>{status}</div> : null}

        <section className="settings_panel">
          <h2>个人资料</h2>
          <div className="profile_card_layout">
            <div className="profile_avatar_side">
              <img className="avatar_preview large" src={avatarPreview} alt="avatar-preview" onError={(e) => { e.currentTarget.src = "/avatar.jpg"; }} />
              <button className="btn" onClick={triggerAvatarPicker} disabled={saving || loading}>更换头像</button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={onAvatarPicked}
              />
            </div>

            <div className="profile_info_side">
              <div className="profile_row">
                <div className="profile_row_label">用户名</div>
                <div className="profile_row_value">
                  {isEditingUsername ? (
                    <input value={usernameDraft} onChange={(e) => setUsernameDraft(e.target.value)} maxLength={32} />
                  ) : (
                    <span>{username || "-"}</span>
                  )}
                </div>
                <div className="profile_row_actions">
                  {!isEditingUsername ? (
                    <span />
                  ) : (
                    <>
                      <button className="btn primary" onClick={saveUsername} disabled={saving || loading}>保存</button>
                      <button
                        className="btn"
                        onClick={() => {
                          setUsernameDraft(username);
                          setIsEditingUsername(false);
                        }}
                        disabled={saving || loading}
                      >
                        取消
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="profile_row">
                <div className="profile_row_label">邮箱</div>
                <div className="profile_row_value"><span>{email || "-"}</span></div>
                <div className="profile_row_actions" />
              </div>

              <div className="profile_row_actions_under_email">
                <button className="btn" onClick={() => setIsEditingUsername(true)} disabled={saving || loading}>修改用户名</button>
                <button
                  className="btn move_password_btn"
                  onClick={() => {
                    setPasswordError("");
                    setCurrentPassword("");
                    setNewPassword("");
                    setShowPasswordModal(true);
                  }}
                  disabled={saving || loading}
                >
                  修改密码
                </button>
                <button
                  className="btn danger_btn delete_account_btn"
                  onClick={() => {
                    setDeleteError("");
                    setDeletePassword("");
                    setShowDeleteModal(true);
                  }}
                  disabled={saving || loading}
                >
                  注销账号
                </button>
              </div>

              <div className="profile_overview_cards">
                <div className="overview_card">
                  <span>自定义提示词</span>
                  <strong>{prompts.length}</strong>
                </div>
                <div className="overview_card">
                  <span>安全状态</span>
                  <strong>{isAuthenticated ? "已登录" : "未登录"}</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="settings_panel">
          <h2>提示词系统</h2>
          <p className="settings_desc">你可以维护自己的 AI 提示词模板，在不同页面调用时按需求选择。</p>

          <div className="prompt_toolbar" style={{ marginTop: 12 }}>
            <input
              className="prompt_search_input"
              value={promptSearch}
              onChange={(e) => setPromptSearch(e.target.value)}
              placeholder="搜索标题、内容、标签"
            />
            <div className="prompt_filter_group">
              <button className={`btn ${promptFilter === "all" ? "primary" : ""}`} onClick={() => setPromptFilter("all")} disabled={saving || loading}>全部</button>
              <button className={`btn ${promptFilter === "favorite" ? "primary" : ""}`} onClick={() => setPromptFilter("favorite")} disabled={saving || loading}>收藏</button>
              <button className={`btn ${promptFilter === "enabled" ? "primary" : ""}`} onClick={() => setPromptFilter("enabled")} disabled={saving || loading}>已启用</button>
              <button className={`btn ${promptFilter === "disabled" ? "primary" : ""}`} onClick={() => setPromptFilter("disabled")} disabled={saving || loading}>已停用</button>
              <button className="btn primary" onClick={openCreatePromptModal} disabled={saving || loading}>添加</button>
            </div>
          </div>

          <div className="prompt_list" style={{ marginTop: 12 }}>
            {filteredPrompts.length === 0 ? <div className="status_line">没有符合筛选条件的提示词。</div> : null}
            {filteredPrompts.map((item) => (
              <div className="prompt_item" key={item.id}>
                <div className="prompt_item_head">
                  <div>
                    <div className="prompt_item_title">{isPromptFavorite(item.favorite) ? "★ " : ""}{item.title}</div>
                    <div className="prompt_item_meta">{item.description || "无说明"} | {item.enabled === false ? "停用" : "启用"}</div>
                    {Array.isArray(item.tags) && item.tags.length > 0 ? (
                      <div className="prompt_tags">
                        {item.tags.map((tag) => (
                          <span className="prompt_tag" key={`${item.id}_${tag}`}>{tag}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="settings_actions" style={{ marginTop: 0 }}>
                    <button className="btn" onClick={() => togglePromptFavorite(item)} disabled={saving || loading}>{isPromptFavorite(item.favorite) ? "取消收藏" : "收藏"}</button>
                    <button className="btn" onClick={() => editPrompt(item)} disabled={saving || loading}>编辑</button>
                    <button className="btn" onClick={() => deletePrompt(item.id)} disabled={saving || loading}>删除</button>
                  </div>
                </div>
                <div className="prompt_item_content">{item.content}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="settings_panel">
          <h2>题库测验设置</h2>
          <p className="settings_desc">学习路径中的“题库测验”默认题量（首次生成使用该值，历史已生成题目不受影响）。</p>
          <div className="settings_grid" style={{ marginTop: 10 }}>
            <div className="settings_field">
              <label>默认题量（1-50）</label>
              <input
                type="number"
                min={1}
                max={50}
                value={bankQuizDefaultCount}
                onChange={(e) => setBankQuizDefaultCount(e.target.value)}
              />
            </div>
          </div>
          <div className="settings_actions" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={saveBankQuizDefaultCount} disabled={saving || loading}>保存默认题量</button>
          </div>
        </section>

        <section className="settings_panel">
          <h2>统计特征导入导出</h2>
          <p className="settings_desc">支持导出当前用户画像统计特征为 CSV/JSON，也可导入历史文件恢复统计画像。导入会覆盖当前账号既有画像统计，不会修改课程、错题、重做记录本身。</p>
          <div className="data_portability_actions">
            <button className="btn" onClick={() => exportProfile("csv")} disabled={saving || loading}>导出 CSV</button>
            <button className="btn" onClick={() => exportProfile("json")} disabled={saving || loading}>导出 JSON</button>
            <button className="btn primary" onClick={triggerProfileImport} disabled={saving || loading}>导入 CSV/JSON</button>
            <input
              ref={profileImportInputRef}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              style={{ display: "none" }}
              onChange={onProfileImportPicked}
            />
          </div>
          <div className="data_portability_summary">
            <div className="data_portability_summary_item">
              <span>画像状态</span>
              <strong>{profileSummary?.has_profile ? "已生成" : "暂无画像"}</strong>
            </div>
            <div className="data_portability_summary_item">
              <span>测验总数</span>
              <strong>{profileSummary?.learning_activity?.total_quizzes ?? 0}</strong>
            </div>
            <div className="data_portability_summary_item">
              <span>综合得分</span>
              <strong>{profileSummary?.knowledge_mastery?.overall_score ?? 0}</strong>
            </div>
            <div className="data_portability_summary_item">
              <span>建议条数</span>
              <strong>{profileSummary?.recommendations_count ?? 0}</strong>
            </div>
          </div>
        </section>

        {showPromptModal ? (
          <div className="settings_modal_mask" onClick={() => setShowPromptModal(false)}>
            <div className="settings_modal_card prompt_modal_card" onClick={(e) => e.stopPropagation()}>
              <h3>{editingPromptId ? "编辑提示词" : "添加提示词"}</h3>

              <div className="prompt_modal_scroll">
                <div className="settings_grid" style={{ marginTop: 10 }}>
                  <div className="settings_field">
                    <label>提示词标题</label>
                    <input value={promptTitle} onChange={(e) => setPromptTitle(e.target.value)} placeholder="例如：测验解析风格" />
                  </div>
                  <div className="settings_field" style={{ gridColumn: "1 / -1" }}>
                    <label>说明（可选）</label>
                    <input value={promptDescription} onChange={(e) => setPromptDescription(e.target.value)} placeholder="这条提示词的用途" />
                  </div>
                  <div className="settings_field" style={{ gridColumn: "1 / -1" }}>
                    <label>提示词内容</label>
                    <textarea value={promptContent} onChange={(e) => setPromptContent(e.target.value)} placeholder="输入完整提示词文本..." />
                    <div className="field_hint">{promptContent.length} 字符</div>
                  </div>
                  <div className="settings_field" style={{ gridColumn: "1 / -1" }}>
                    <label>标签（用逗号分隔）</label>
                    <input value={promptTagsInput} onChange={(e) => setPromptTagsInput(e.target.value)} placeholder="例如：测验, 解析, 高中" />
                  </div>
                </div>
              </div>

              <div className="settings_actions prompt_modal_actions">
                <label style={{ fontSize: 13, color: "#9ca3af" }}>
                  <input type="checkbox" checked={promptEnabled} onChange={(e) => setPromptEnabled(e.target.checked)} style={{ marginRight: 6 }} />
                  启用
                </label>
                <label style={{ fontSize: 13, color: "#9ca3af" }}>
                  <input type="checkbox" checked={promptFavorite} onChange={(e) => setPromptFavorite(e.target.checked)} style={{ marginRight: 6 }} />
                  收藏
                </label>
                <button className="btn primary" onClick={savePrompt} disabled={saving || loading}>保存提示词</button>
                <button
                  className="btn"
                  onClick={() => {
                    setShowPromptModal(false);
                    resetPromptEditor();
                  }}
                  disabled={saving || loading}
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showPasswordModal ? (
          <div className="settings_modal_mask" onClick={() => setShowPasswordModal(false)}>
            <div className="settings_modal_card" onClick={(e) => e.stopPropagation()}>
              <h3>修改密码</h3>
              <div className="settings_field">
                <label>当前密码</label>
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              </div>
              <div className="settings_field">
                <label>新密码（至少8位，包含字母和数字）</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              {passwordError ? <div className="status_line error">{passwordError}</div> : null}
              <div className="settings_actions">
                <button className="btn primary" onClick={savePassword} disabled={saving || loading}>更新密码</button>
                <button className="btn" onClick={() => setShowPasswordModal(false)} disabled={saving || loading}>取消</button>
              </div>
            </div>
          </div>
        ) : null}

        {showDeleteModal ? (
          <div className="settings_modal_mask" onClick={() => setShowDeleteModal(false)}>
            <div className="settings_modal_card" onClick={(e) => e.stopPropagation()}>
              <h3>确认注销账号</h3>
              <p className="settings_desc">注销后会永久删除该账号的学习数据、错题、重做记录与提示词模板，且无法恢复。请输入当前密码确认，此操作不可撤销。</p>
              <div className="settings_field">
                <label>当前密码</label>
                <input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
              </div>
              {deleteError ? <div className="status_line error">{deleteError}</div> : null}
              <div className="settings_actions">
                <button className="btn danger_btn" onClick={deleteAccount} disabled={saving || loading}>确认注销</button>
                <button className="btn" onClick={() => setShowDeleteModal(false)} disabled={saving || loading}>取消</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default SettingsPage;
