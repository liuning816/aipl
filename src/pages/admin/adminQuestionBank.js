import { useEffect, useState, useCallback } from "react";
import Header from "../../components/header/header";
import axios from "axios";
import Modal from "../../components/modal/modal";
import Loader from "../../components/loader/loader";
import userManager from "../../utils/userManager";
import { ROUTES } from "../../routes";
import "./adminQuestionBank.css";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";

const AdminQuestionBank = () => {
  const [activeTab, setActiveTab] = useState("reports");
  const [reports, setReports] = useState([]);
  const [reportsSearch, setReportsSearch] = useState("");
  const [reportsPagination, setReportsPagination] = useState({ limit: 12, skip: 0, total: 0, count: 0, has_more: false });
  const [announcementsSearch, setAnnouncementsSearch] = useState("");
  const [announcementsPagination, setAnnouncementsPagination] = useState({ limit: 12, skip: 0, total: 0, count: 0, has_more: false });
  const [loading, setLoading] = useState(false);
  const [contents, setContents] = useState([]);
  const [publicSearch, setPublicSearch] = useState("");
  const [publicPagination, setPublicPagination] = useState({ limit: 12, skip: 0, total: 0, count: 0, has_more: false });
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewPagination, setReviewPagination] = useState({ limit: 12, skip: 0, total: 0, count: 0, has_more: false });
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);


  const resolveReport = async (reportId, action = "resolved") => {
    try {
      userManager.applyAuthHeader(axios);
      await axios.post(`${API_BASE}/api/admin/question-bank/reports/${reportId}/resolve`, { action, note: "handled via admin UI" }, { withCredentials: true });
      fetchReports();
    } catch (e) {
      alert("无法处理举报：" + (e?.response?.data?.error || e.message));
    }
  };

  const fetchPublicContents = useCallback(async () => {
    setLoading(true);
    try {
      userManager.applyAuthHeader(axios);
      const params = new URLSearchParams();
      params.append("visibility", "public");
      params.append("limit", String(publicPagination.limit || 12));
      params.append("skip", String(publicPagination.skip || 0));
      if (publicSearch) params.append("tag", publicSearch);
      const res = await axios.get(`${API_BASE}/api/question-bank/contents?${params.toString()}`, { withCredentials: true });
      const payload = res.data?.data || {};
      setContents(payload.items || []);
      setPublicPagination((prev) => ({ ...prev, total: payload.pagination?.total || payload.total || (payload.items || []).length, count: (payload.items || []).length, has_more: (payload.pagination?.has_more ?? false) }));
    } catch (e) {
      setContents([]);
    } finally {
      setLoading(false);
    }
  }, [publicPagination.skip, publicPagination.limit, publicSearch]);

  const fetchDetail = async (id) => {
    setDetailLoading(true);
    try {
      userManager.applyAuthHeader(axios);
      const res = await axios.get(`${API_BASE}/api/question-bank/contents/${id}`, { withCredentials: true });
      setSelectedDetail(res.data?.data || null);
    } catch (e) {
      setSelectedDetail(null);
      alert("加载详情失败：" + (e?.response?.data?.error || e.message));
    } finally {
      setDetailLoading(false);
    }
  };

  // Reports fetch with pagination
  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      userManager.applyAuthHeader(axios);
      const params = new URLSearchParams();
      params.append("status", "open");
      params.append("limit", String(reportsPagination.limit || 12));
      params.append("skip", String(reportsPagination.skip || 0));
      const res = await axios.get(`${API_BASE}/api/admin/question-bank/reports?${params.toString()}`, { withCredentials: true });
      const rows = res.data?.data || [];
      // fetch content previews in parallel (best-effort)
      const withPreviews = await Promise.all(
        rows.map(async (r) => {
          try {
            const creq = await axios.get(`${API_BASE}/api/question-bank/contents/${r.content_id}`, { withCredentials: true });
            return { ...r, _preview: creq.data?.data || null };
          } catch (e) {
            return { ...r, _preview: null };
          }
        })
      );
      // client-side basic search (by user_id or content_id or reason)
      const filtered = withPreviews.filter((r) => {
        if (!reportsSearch) return true;
        const q = reportsSearch.toLowerCase();
        return String(r.user_id || "").toLowerCase().includes(q) || String(r.content_id || "").toLowerCase().includes(q) || String(r.reason || "").toLowerCase().includes(q);
      });
      setReports(filtered);
      // backend returns rows only; we can approximate count
      setReportsPagination((prev) => ({ ...prev, count: filtered.length }));
    } catch (e) {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [reportsPagination.skip, reportsPagination.limit, reportsSearch]);

  const openDetail = async (id) => {
    if (!id) return;
    setDetailModalOpen(true);
    await fetchDetail(id);
  };

  const renderVisualContentDetail = (item) => {
    if (!item) return null;
    if (item.content_type === "paper") {
      const rows = Array.isArray(item.items) ? item.items : [];
      return (
        <div className="visual-detail-list">
          {rows.map((row, idx) => (
            <article className="visual-detail-item" key={`detail-paper-${idx}`}>
              <h4>第 {idx + 1} 题</h4>
              <p><strong>题目：</strong>{row?.question || "-"}</p>
              {(row?.options && Array.isArray(row.options) && row.options.length) ? (
                <div>
                  <strong>选项：</strong>
                  <ul>
                    {row.options.map((opt, oi) => <li key={`opt-${idx}-${oi}`}>{opt}</li>)}
                  </ul>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      );
    }
                    
    const c = item.content || {};
    const options = Array.isArray(c.options) ? c.options : [];
    return (
      <article className="visual-detail-item">
        <p><strong>题目：</strong>{c.question || c.text || "-"}</p>
        <p><strong>类型：</strong>{c.type || "single_question"}</p>
        {options.length ? (
          <div>
            <strong>选项：</strong>
            <ul>
              {options.map((opt, idx) => <li key={`detail-opt-${idx}`}>{opt}</li>)}
            </ul>
          </div>
        ) : null}
        <p><strong>答案：</strong>{c.answer || c.correctAnswer || c.modelAnswer || "-"}</p>
        <p><strong>解析：</strong>{c.explanation || c.reason || "-"}</p>
      </article>
    );
  };

  const onReportsSearch = () => {
    setReportsPagination((p) => ({ ...p, skip: 0 }));
    fetchReports();
  };

  const onReportsPrev = () => {
    setReportsPagination((p) => ({ ...p, skip: Math.max(0, (p.skip || 0) - (p.limit || 12)) }));
  };

  const onReportsNext = () => {
    setReportsPagination((p) => ({ ...p, skip: (p.skip || 0) + (p.limit || 12) }));
  };

  const onPublicSearch = () => {
    setPublicPagination((p) => ({ ...p, skip: 0 }));
    fetchPublicContents();
  };

  const onPublicPrev = () => {
    setPublicPagination((p) => ({ ...p, skip: Math.max(0, (p.skip || 0) - (p.limit || 12)) }));
  };

  const onPublicNext = () => {
    setPublicPagination((p) => ({ ...p, skip: (p.skip || 0) + (p.limit || 12) }));
  };

  useEffect(() => {
    if (activeTab === "public") fetchPublicContents();
  }, [activeTab, publicPagination.skip, publicPagination.limit, publicSearch, fetchPublicContents]);

  useEffect(() => {
    if (activeTab === "reports") fetchReports();
  }, [activeTab, reportsPagination.skip, reportsPagination.limit, reportsSearch, fetchReports]);

  const moderateContent = async (contentId, action) => {
    try {
      userManager.applyAuthHeader(axios);
      await axios.post(`${API_BASE}/api/admin/question-bank/content/${contentId}/moderate`, { action, reason: "admin action via UI" }, { withCredentials: true });
      if (activeTab === "public") fetchPublicContents();
      else fetchReports();
    } catch (e) {
      alert("操作失败：" + (e?.response?.data?.error || e.message));
    }
  };

  return (
    <div className="question-bank-page">
      <Header />
      <div className="question-bank-content">
        <div className="qb-layout">
          <aside className="qb-floating-nav">
            <button className="qb-avatar-tile" title="用户中心" onClick={() => (window.location.href = ROUTES.PROFILE)}>
              <img src="/avatar.jpg" alt="avatar" />
            </button>

            <button className={`qb-nav-item ${activeTab === "announcements" ? "active" : ""}`} onClick={() => setActiveTab("announcements")}>
              <span>系统公告</span>
            </button>
            <button className={`qb-nav-item ${activeTab === "review" ? "active" : ""}`} onClick={() => setActiveTab("review")}>
              <span>内容审核</span>
            </button>
            <button className={`qb-nav-item ${activeTab === "reports" ? "active" : ""}`} onClick={() => setActiveTab("reports")}>
              <span>举报处理</span>
            </button>
            <button className={`qb-nav-item ${activeTab === "public" ? "active" : ""}`} onClick={() => setActiveTab("public")}>
              <span>公共题库</span>
            </button>
          </aside>

          <div className="qb-main-panel">
            {activeTab === "announcements" && (
              <section className="panel">
                <h3>系统公告</h3>
                <p className="meta">在这里可以发布重要系统通知。</p>
                <div className="filter-row" style={{ marginTop: 12 }}>
                  <input placeholder="按标题或内容搜索" value={announcementsSearch} onChange={(e) => setAnnouncementsSearch(e.target.value)} />
                  <button onClick={() => { setAnnouncementsPagination((p) => ({ ...p, skip: 0 })); }}>查询</button>
                </div>
                <div className="pager-row" style={{ marginTop: 12 }}>
                  <span className="meta">共 {announcementsPagination.total || 0} 条</span>
                  <div>
                    <button onClick={() => setAnnouncementsPagination((p) => ({ ...p, skip: Math.max(0, (p.skip || 0) - (p.limit || 12)) }))}>上一页</button>
                    <button onClick={() => setAnnouncementsPagination((p) => ({ ...p, skip: (p.skip || 0) + (p.limit || 12) }))}>下一页</button>
                  </div>
                </div>
              </section>
            )}

            {activeTab === "review" && (
              <section className="panel">
                <h3>内容审核</h3>
                <p className="meta">可显示待审核的上传内容，支持通过/拒绝。</p>
                <div className="filter-row" style={{ marginTop: 12 }}>
                  <input placeholder="按用户/标题/内容搜索" value={reviewSearch} onChange={(e) => setReviewSearch(e.target.value)} />
                  <button onClick={() => { setReviewPagination((p) => ({ ...p, skip: 0 })); }}>查询</button>
                </div>
                <div className="pager-row" style={{ marginTop: 12 }}>
                  <span className="meta">共 {reviewPagination.total || 0} 条</span>
                  <div>
                    <button onClick={() => setReviewPagination((p) => ({ ...p, skip: Math.max(0, (p.skip || 0) - (p.limit || 12)) }))}>上一页</button>
                    <button onClick={() => setReviewPagination((p) => ({ ...p, skip: (p.skip || 0) + (p.limit || 12) }))}>下一页</button>
                  </div>
                </div>
              </section>
            )}

            {activeTab === "reports" && (
              <section className="panel">
                <div className="qb-panel-head">
                  <h2>举报处理</h2>
                  <p className="meta">处理用户提交的举报，支持标记为已处理、驳回或对关联内容执行隐藏/删除操作。</p>
                </div>
                {loading ? (
                  <div>加载中...</div>
                ) : (
                  <div>
                    <div className="meta" style={{ marginBottom: 12 }}>未处理举报数：{reports.length}</div>
                    <div className="filter-row" style={{ marginTop: 8 }}>
                      <input placeholder="按用户ID/内容ID/关键词搜索" value={reportsSearch} onChange={(e) => setReportsSearch(e.target.value)} />
                      <button onClick={onReportsSearch}>查询</button>
                    </div>
                    <div className="list-wrap">
                      {reports.length === 0 ? (
                        <div className="meta">暂无未处理举报。</div>
                      ) : (
                        reports.map((r) => (
                          <div key={r.id} className="bank-item">
                            <div className="visual-detail-item">
                              <h4 style={{ marginBottom: 6 }}>{r.reason}</h4>
                              <div className="meta">举报用户：{r.user_id} · 内容ID：{r.content_id}</div>
                              {r._preview ? (
                                <div className="content-preview" style={{ marginTop: 8 }}>
                                  <div style={{ fontWeight: 600 }}>{r._preview.title || '未命名内容'}</div>
                                  <div style={{ marginTop: 6 }}>{r._preview.content?.text || (r._preview.items && r._preview.items.slice(0,2).map(it=>it.question).join(' / ')) || ''}</div>
                                </div>
                              ) : null}
                              <div style={{ marginTop: 10 }} className="item-actions">
                                <button onClick={() => resolveReport(r.id, 'resolved')}>标记为已处理</button>
                                <button onClick={() => resolveReport(r.id, 'rejected')} style={{ marginLeft: 8 }}>驳回</button>
                                <button onClick={() => moderateContent(r.content_id, 'hide')} style={{ marginLeft: 8 }}>隐藏内容</button>
                                <button onClick={() => { if (window.confirm('确认删除该内容吗？此操作不可恢复。')) moderateContent(r.content_id, 'delete'); }} style={{ marginLeft: 8 }}>删除内容</button>
                                <button onClick={() => openDetail(r.content_id)} style={{ marginLeft: 8 }}>查看详情</button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="pager-row" style={{ marginTop: 12 }}>
                      <span className="meta">共 {reportsPagination.count || reports.length} 条</span>
                      <div>
                        <button onClick={onReportsPrev} disabled={(reportsPagination.skip || 0) <= 0}>上一页</button>
                        <button onClick={onReportsNext} style={{ marginLeft: 8 }}>下一页</button>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}

            {activeTab === "public" && (
              <section className="panel">
                <div className="qb-panel-head">
                  <h2>公共题库</h2>
                  <p className="meta">展示近期公开内容，支持管理员对内容进行隐藏/删除/恢复。</p>
                </div>
                {loading ? (
                  <div>加载中...</div>
                ) : (
                  <div>
                    <div className="filter-row" style={{ marginTop: 8 }}>
                      <input placeholder="按标签或标题搜索" value={publicSearch} onChange={(e) => setPublicSearch(e.target.value)} />
                      <button onClick={onPublicSearch}>查询</button>
                    </div>
                    <div className="list-wrap">
                    {contents.length === 0 ? (
                      <div className="meta">暂无公开内容。</div>
                    ) : (
                      contents.map((c) => (
                        <div key={c.id} className="bank-item-public">
                          <div style={{ padding: 12 }}>
                            <h3 style={{ marginBottom: 6 }}>{c.title}</h3>
                            <div className="meta">作者：{c.user_id} · 类型：{c.content_type}</div>
                            <div style={{ marginTop: 10 }} className="item-actions">
                              <button onClick={() => moderateContent(c.id, 'hide')}>隐藏</button>
                              <button onClick={() => { if (window.confirm('确认删除该内容吗？此操作不可恢复。')) moderateContent(c.id, 'delete'); }} style={{ marginLeft: 8 }}>删除</button>
                              <button onClick={() => moderateContent(c.id, 'restore')} style={{ marginLeft: 8 }}>恢复</button>
                              <button onClick={() => openDetail(c.id)} style={{ marginLeft: 8 }}>查看详情</button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                    </div>
                    <div className="pager-row" style={{ marginTop: 12 }}>
                      <span className="meta">共 {publicPagination.total || contents.length} 条</span>
                      <div>
                        <button onClick={onPublicPrev} disabled={(publicPagination.skip || 0) <= 0}>上一页</button>
                        <button onClick={onPublicNext} style={{ marginLeft: 8 }}>下一页</button>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
      <Modal open={detailModalOpen} onClose={() => setDetailModalOpen(false)}>
        <div className="draft-modal-wrap">
          <h2>内容详情</h2>
          {detailLoading ? (
            <Loader>详情加载中...</Loader>
          ) : selectedDetail ? (
            <div className="detail-wrap">
              <h3>{selectedDetail.title}</h3>
              <p className="meta">{selectedDetail.content_type} | {selectedDetail.visibility} | {selectedDetail.status}</p>
              <p>{selectedDetail.description || "暂无描述"}</p>
              <p className="meta">标签: {(selectedDetail.tags || []).join(", ") || "-"}</p>
              {renderVisualContentDetail(selectedDetail)}
            </div>
          ) : (
            <p className="meta">暂无详情</p>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default AdminQuestionBank;
