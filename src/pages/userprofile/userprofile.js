import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";
import { useNavigate } from "react-router-dom";
import Header from "../../components/header/header";
import { ROUTES } from "../../routes";
import userManager from "../../utils/userManager";
import "./userprofile.css";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";

const STATUS_TEXT = {
  improving: "进步中",
  review: "需加强",
  inactive: "待激活",
  normal: "稳定",
};

function UserProfile() {
  const navigate = useNavigate();
  const savedSortMode = localStorage.getItem("userprofile_sort_mode");
  const initialSortMode = savedSortMode === "custom" || savedSortMode === "recent" ? savedSortMode : "recent";

  const [subjects, setSubjects] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [sortBy, setSortBy] = useState(initialSortMode);
  const [isManagingOrder, setIsManagingOrder] = useState(false);
  const [orderDraft, setOrderDraft] = useState([]);
  const [draggingSubject, setDraggingSubject] = useState("");
  const [dragOverSubject, setDragOverSubject] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [subjectDetail, setSubjectDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isAuthenticated = userManager.isAuthenticated();
  const username = localStorage.getItem("username") || "User";
  const avatarUrl = userManager.getAvatarUrl() || "/avatar.jpg";

  const authHeaders = useMemo(
    () => ({ withCredentials: true }),
    []
  );

  const fetchOverview = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError("");
    try {
      const response = await axios.get(`${API_BASE}/api/user-profile/subjects-overview`, {
        params: {
          q: searchKeyword || undefined,
          sort: sortBy,
        },
        ...authHeaders,
      });
      setSubjects(response.data?.subjects || []);
    } catch (err) {
      setError(err?.response?.data?.error || "学科数据加载失败，请稍后重试");
      setSubjects([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, searchKeyword, sortBy, isAuthenticated]);

  const fetchSubjectDetail = useCallback(
    async (subject) => {
      if (!subject) return;
      setLoading(true);
      setError("");
      try {
        const response = await axios.get(`${API_BASE}/api/user-profile/subject-detail`, {
          params: {
            subject,
          },
          ...authHeaders,
        });
        setSubjectDetail(response.data?.detail || null);
        setSelectedSubject(subject);
      } catch (err) {
        setError(err?.response?.data?.error || "学科详情加载失败，请稍后重试");
      } finally {
        setLoading(false);
      }
    },
    [authHeaders]
  );

  const persistOrder = useCallback(
    async (orderedSubjects) => {
      try {
        await axios.post(
          `${API_BASE}/api/user-profile/subjects-order`,
          {
            order: orderedSubjects,
          },
          authHeaders
        );
      } catch (err) {
        // Keep UI responsive even if order save fails.
      }
    },
    [authHeaders]
  );

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(ROUTES.LOGIN);
      return;
    }
    fetchOverview();
  }, [fetchOverview, isAuthenticated, navigate]);

  useEffect(() => {
    localStorage.setItem("userprofile_sort_mode", sortBy);
  }, [sortBy]);

  const handleSearch = () => {
    setSearchKeyword(searchInput.trim());
  };

  const startManageOrder = () => {
    setOrderDraft([...subjects]);
    setIsManagingOrder(true);
  };

  const cancelManageOrder = () => {
    setOrderDraft([]);
    setIsManagingOrder(false);
  };

  const confirmManageOrder = async () => {
    const next = [...orderDraft];
    setSubjects(next);
    setOrderDraft([]);
    setIsManagingOrder(false);
    const ordered = next.map((item) => item.subject);
    await persistOrder(ordered);
  };

  const reorderDraftBySubject = (sourceSubject, targetSubject) => {
    if (!sourceSubject || !targetSubject || sourceSubject === targetSubject) return;

    setOrderDraft((prev) => {
      const fromIndex = prev.findIndex((item) => item.subject === sourceSubject);
      const toIndex = prev.findIndex((item) => item.subject === targetSubject);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return prev;

      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const handleDragStart = (subject, event) => {
    setDraggingSubject(subject);
    setDragOverSubject(subject);
    if (event?.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", subject);
    }
  };

  const handleDragOver = (subject, event) => {
    event.preventDefault();
    if (dragOverSubject !== subject) {
      setDragOverSubject(subject);
    }
  };

  const handleDrop = (targetSubject, event) => {
    event.preventDefault();
    const sourceSubject = draggingSubject || event?.dataTransfer?.getData("text/plain") || "";
    reorderDraftBySubject(sourceSubject, targetSubject);
    setDraggingSubject("");
    setDragOverSubject("");
  };

  const handleDragEnd = () => {
    setDraggingSubject("");
    setDragOverSubject("");
  };

  const displayedSubjects = isManagingOrder ? orderDraft : subjects;

  const normalizedDetail = useMemo(() => {
    const d = subjectDetail || {};
    const weak = d.weakPoints || d.weak_points || [];
    const recs = d.recommendations || d.personalized_recommendations || [];
    const trendRaw = d.weeklyScores || d.weekly_scores || d.weeklyTrend || d.weekly_trend || [];

    const trend = (Array.isArray(trendRaw) ? trendRaw : [])
      .map((item, idx) => {
        const label = item.week || item.day || item.label || `${idx + 1}`;
        const value = Number(item.score ?? item.count ?? item.value);
        return {
          label: String(label),
          value: Number.isFinite(value) ? value : null,
        };
      })
      .filter((item) => item.value !== null);

    const weakPoints = Array.isArray(weak) ? weak : [];

    const extractPlaceholderIndex = (value) => {
      const text = String(value || "").trim();
      if (!text) return null;

      const patterns = [
        /^未命名知识点\((\d+)\)$/i,
        /^知识点\s*(\d+)$/i,
        /^subtopic[_\s-]?(\d+)$/i,
        /^topic[_\s-]?(\d+)$/i,
      ];

      for (const p of patterns) {
        const matched = text.match(p);
        if (matched) return Number(matched[1]);
      }

      return null;
    };

    const resolveUnnamedWeakPoint = (rawName) => {
      const text = String(rawName || "").trim();
      const idx = extractPlaceholderIndex(text);
      if (!idx) return text;

      if (!Number.isFinite(idx) || idx <= 0) return text;

      try {
        const roadmaps = JSON.parse(localStorage.getItem("roadmaps") || "{}");
        const subjectName = d.subject || selectedSubject;
        const rm = roadmaps?.[subjectName];
        if (!rm || typeof rm !== "object") return text;

        const weeks = Object.keys(rm);
        for (const wk of weeks) {
          const subs = rm?.[wk]?.subtopics;
          if (!Array.isArray(subs)) continue;
          const item = subs[idx - 1];
          if (!item) continue;
          const name = typeof item === "string" ? item : item?.subtopic || item?.title || item?.name;
          if (name && String(name).trim()) return String(name).trim();
        }
      } catch (e) {
        // ignore local parse errors and keep original fallback name
      }

      return text;
    };

    const sanitizeTextWithWeakPointName = (rawText) => {
      const text = String(rawText || "");
      return text.replace(/未命名知识点\(\d+\)|知识点\s*\d+|subtopic[_\s-]?\d+|topic[_\s-]?\d+/gi, (full) => {
        const resolved = resolveUnnamedWeakPoint(full);
        return resolved || full;
      });
    };

    const fixedWeakPoints = weakPoints.map((item) => ({
      ...item,
      name: resolveUnnamedWeakPoint(item?.name),
    }));

    const fixedRecommendations = (Array.isArray(recs) ? recs : []).map((item) => ({
      ...item,
      title: sanitizeTextWithWeakPointName(item?.title),
      content: sanitizeTextWithWeakPointName(item?.content),
    }));

    const fallbackWeak =
      fixedWeakPoints.length === 0 && Number(d.wrongCount || d.wrong_count || 0) > 0
        ? [
            {
              name: "综合薄弱点",
              rate: Number(d.errorRate ?? d.error_rate ?? 0),
              count: Number(d.wrongCount || d.wrong_count || 0),
            },
          ]
        : fixedWeakPoints;

    const errRate = Number(d.errorRate ?? d.error_rate ?? 0);
    const avg5 = Number(d.avgScoreRecent5 ?? d.avg_score_recent_5 ?? 0);
    const fallbackRecommendations = [];
    if (errRate >= 30) {
      fallbackRecommendations.push({
        priority: "high",
        title: "先压低错题率",
        content: "建议先复盘最近错题，再做同主题3-5道巩固题，减少重复失误。",
      });
    }
    if (avg5 > 0 && avg5 < 70) {
      fallbackRecommendations.push({
        priority: "medium",
        title: "提高基础题稳定性",
        content: "最近均分偏低，建议每天固定15-20分钟做基础题复盘。",
      });
    }
    if (fallbackWeak.length > 0) {
      fallbackRecommendations.push({
        priority: "medium",
        title: `优先攻克：${fallbackWeak[0].name}`,
        content: "围绕该薄弱点先补概念，再做同类题即时检验。",
      });
    }
    if (fallbackRecommendations.length === 0) {
      fallbackRecommendations.push({
        priority: "low",
        title: "保持当前节奏",
        content: "当前表现相对稳定，建议逐步提升题目难度，持续拉高上限。",
      });
    }

    return {
      subject: d.subject,
      lastStudyAt: d.lastStudyAt || d.last_study_at,
      avgScoreRecent5: d.avgScoreRecent5 ?? d.avg_score_recent_5,
      errorRate: d.errorRate ?? d.error_rate,
      totalQuizzes: d.totalQuizzes ?? d.total_quizzes,
      wrongCount: d.wrongCount ?? d.wrong_count,
      redoCount: d.redoCount ?? d.redo_count,
      progressCompleted: d.progressCompleted ?? d.progress_completed,
      progressTotal: d.progressTotal ?? d.progress_total,
      weakPoints: fallbackWeak,
      recommendations: fixedRecommendations.length > 0 ? fixedRecommendations : fallbackRecommendations,
      trend,
    };
  }, [subjectDetail, selectedSubject]);

  const chartData = useMemo(() => {
    const trend = normalizedDetail.trend || [];
    return {
      labels: trend.map((item) => `第${item.label}周`),
      datasets: [
        {
          label: "周平均得分",
          data: trend.map((item) => item.value),
          borderColor: "#60a5fa",
          backgroundColor: "rgba(96, 165, 250, 0.2)",
          tension: 0.35,
          fill: true,
        },
      ],
    };
  }, [normalizedDetail]);

  const trendInsight = useMemo(() => {
    const trend = normalizedDetail.trend || [];
    if (trend.length < 2) return "趋势数据较少，继续完成更多测验后可查看变化方向。";

    const first = Number(trend[0]?.value || 0);
    const last = Number(trend[trend.length - 1]?.value || 0);
    const delta = Number((last - first).toFixed(2));

    if (delta >= 5) return `最近阶段呈上升趋势（+${delta} 分），建议保持当前学习节奏。`;
    if (delta <= -5) return `最近阶段有回落趋势（${delta} 分），建议优先复盘薄弱知识点。`;
    return "近期成绩整体平稳，建议通过错题重练推动下一步提升。";
  }, [normalizedDetail]);

  const inDetail = Boolean(selectedSubject && subjectDetail);

  return (
    <div className="userprofile_wrapper">
      <Header />
      <div className="userprofile_content">
        <section className="userprofile_header">
          <div className="header_identity">
            <img
              className="header_avatar"
              src={avatarUrl}
              alt="avatar"
              onError={(e) => {
                e.currentTarget.src = "/avatar.jpg";
              }}
            />
            <div className="header_texts">
              <h1 className="header_username">{username}</h1>
              <p className="header_title">个人中心</p>
              <p className="header_subtitle">按学科查看你的学习表现与薄弱点</p>
            </div>
          </div>
          <div className="header_actions">
            {inDetail ? (
              <button
                className="refresh_button"
                onClick={() => {
                  setSelectedSubject("");
                  setSubjectDetail(null);
                }}
              >
                返回学科列表
              </button>
            ) : null}
            <button className="refresh_button" onClick={fetchOverview} disabled={loading}>
              刷新数据
            </button>
            <button className="refresh_button" onClick={() => navigate(ROUTES.SETTINGS)}>
              设置
            </button>
          </div>
        </section>

        {error ? <div className="error_block">{error}</div> : null}

        {!inDetail ? (
          <>
            <section className="subject_toolbar panel">
              <div className="subject_search_group">
                <input
                  className="subject_search_input"
                  type="text"
                  placeholder="搜索学科（如 高等数学、概率论）"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearch();
                  }}
                />
                <button className="refresh_button" onClick={handleSearch}>
                  搜索
                </button>
              </div>
              <div className="subject_sort_group">
                <span>排序方式</span>
                <select
                  className="subject_sort_select"
                  value={sortBy}
                  onChange={(e) => {
                    const nextSort = e.target.value;
                    setSortBy(nextSort);
                    if (nextSort !== "custom") {
                      cancelManageOrder();
                    }
                  }}
                >
                  <option value="recent">最近学习时间（近到远）</option>
                  <option value="custom">自定义排序</option>
                </select>
              </div>
              <div className="subject_manage_slot">
                {sortBy === "custom" && !isManagingOrder ? (
                  <button className="refresh_button" onClick={startManageOrder}>管理</button>
                ) : null}
                {sortBy === "custom" && isManagingOrder ? (
                  <div className="subject_manage_group">
                    <button className="refresh_button" onClick={confirmManageOrder}>确认顺序</button>
                    <button className="refresh_button" onClick={cancelManageOrder}>取消</button>
                  </div>
                ) : null}
              </div>
            </section>

            {loading ? <div className="loading_block">加载中...</div> : null}

            {!loading && subjects.length === 0 ? (
              <div className="panel empty_text">暂无匹配学科，试试其他关键词。</div>
            ) : null}

            <section className="subject_list">
              {displayedSubjects.map((item) => {
                const total = Number(item.progressTotal || 0);
                const completed = Number(item.progressCompleted || 0);
                const progressPercent = total > 0 ? Math.min(100, (completed * 100) / total) : 0;
                const status = item.status || "normal";
                return (
                  <article
                    key={item.subject}
                    className={`subject_card ${isManagingOrder ? "reorder_mode" : ""} ${draggingSubject === item.subject ? "dragging" : ""} ${dragOverSubject === item.subject && draggingSubject && draggingSubject !== item.subject ? "drag_over" : ""}`}
                    draggable={sortBy === "custom" && isManagingOrder}
                    onDragStart={(e) => {
                      if (!(sortBy === "custom" && isManagingOrder)) return;
                      handleDragStart(item.subject, e);
                    }}
                    onDragOver={(e) => {
                      if (!(sortBy === "custom" && isManagingOrder)) return;
                      handleDragOver(item.subject, e);
                    }}
                    onDrop={(e) => {
                      if (!(sortBy === "custom" && isManagingOrder)) return;
                      handleDrop(item.subject, e);
                    }}
                    onDragEnd={handleDragEnd}
                    onClick={() => {
                      if (isManagingOrder) return;
                      fetchSubjectDetail(item.subject);
                    }}
                  >
                    <div className="subject_top">
                      <h2>{item.subject}</h2>
                      <span className={`subject_status ${status}`}>
                        {STATUS_TEXT[status] || STATUS_TEXT.normal}
                      </span>
                    </div>

                    <div className="subject_meta">
                      <span>最近学习: {item.lastStudyAt || "暂无"}</span>
                      <span>7天活跃: {item.last7dSessions || 0} 次</span>
                    </div>

                    <div className="subject_progress_row">
                      <span>学习进度</span>
                      <b>{progressPercent}%</b>
                    </div>
                    <div className="subject_progress_bar">
                      <div
                        className="subject_progress_inner"
                        style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                      />
                    </div>

                    <div className="subject_metrics">
                      <div>
                        <span>最近5次平均分</span>
                        <b>{item.avgScoreRecent5 ?? 0}</b>
                      </div>
                      <div>
                        <span>错题率</span>
                        <b>{item.errorRate ?? 0}%</b>
                      </div>
                    </div>

                    {sortBy === "custom" && isManagingOrder ? <div className="subject_drag_hint">按住卡片拖动排序</div> : null}
                  </article>
                );
              })}
            </section>
          </>
        ) : (
          <>
            <section className="summary_grid">
              <div className="summary_card">
                <span>学科</span>
                <strong>{selectedSubject}</strong>
                <em>最近学习: {normalizedDetail?.lastStudyAt || "暂无"}</em>
              </div>
              <div className="summary_card">
                <span>最近5次平均分</span>
                <strong>{normalizedDetail?.avgScoreRecent5 ?? 0}</strong>
                <em>结合测验记录自动更新</em>
              </div>
              <div className="summary_card">
                <span>错题率</span>
                <strong>{normalizedDetail?.errorRate ?? 0}%</strong>
                <em>错题 + 重做结果综合估算</em>
              </div>
            </section>

            <section className="detail_stats_grid">
              <div className="panel detail_stat_card">
                <span>测验次数</span>
                <strong>{normalizedDetail?.totalQuizzes || 0}</strong>
              </div>
              <div className="panel detail_stat_card">
                <span>错题数量</span>
                <strong>{normalizedDetail?.wrongCount || 0}</strong>
              </div>
              <div className="panel detail_stat_card">
                <span>重做记录</span>
                <strong>{normalizedDetail?.redoCount || 0}</strong>
              </div>
              <div className="panel detail_stat_card">
                <span>学习进度</span>
                <strong>{normalizedDetail?.progressCompleted || 0}/{normalizedDetail?.progressTotal || 0}</strong>
              </div>
            </section>

            <section className="grid_two">
              <div className="panel" style={{ minHeight: 280 }}>
                <h2>按周成绩趋势</h2>
                {(normalizedDetail?.trend || []).length > 0 ? (
                  <div className="detail_chart_wrap">
                    <Line
                      data={chartData}
                      options={{ responsive: true, maintainAspectRatio: false, animation: false }}
                    />
                  </div>
                ) : (
                  <p className="empty_text">暂无趋势数据</p>
                )}
                <p className="trend_insight">{trendInsight}</p>
              </div>
              <div className="panel">
                <h2>薄弱知识点</h2>
                {Array.isArray(normalizedDetail?.weakPoints) && normalizedDetail.weakPoints.length > 0 ? (
                  <ul className="area_list weak">
                    {normalizedDetail.weakPoints.map((point) => (
                      <li
                        key={point.name}
                        className="weak_point_item"
                        onClick={() => {
                          const course = encodeURIComponent(selectedSubject || "");
                          const subtopic = encodeURIComponent(point.name || "");
                          navigate(`${ROUTES.WRONG}?course=${course}&subtopic=${subtopic}`);
                        }}
                        title="查看该薄弱点对应错题"
                      >
                        <span>{point.name}</span>
                        <b>{point.rate}%</b>
                        <em>{point.count} 次错误</em>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty_text">暂无薄弱点数据</p>
                )}
              </div>
            </section>

            <section className="panel recommendations">
              <h2>学习建议</h2>
              {Array.isArray(normalizedDetail?.recommendations) && normalizedDetail.recommendations.length > 0 ? (
                <div className="recommendation_list">
                  {normalizedDetail.recommendations.map((item, idx) => (
                    <div key={`${item.title}-${idx}`} className="recommendation_item">
                      <div className={`badge ${item.priority || "low"}`}>{item.priority || "low"}</div>
                      <div className="recommendation_text">
                        <h3>{item.title}</h3>
                        <p>{item.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty_text">暂无建议，继续保持学习节奏。</p>
              )}
            </section>

          </>
        )}
      </div>
    </div>
  );
}

export default UserProfile;
