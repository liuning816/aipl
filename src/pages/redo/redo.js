import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Header from "../../components/header/header";
import Loader from "../../components/loader/loader";
import userManager from "../../utils/userManager";
import { ROUTES } from "../../routes";
import "./redo.css";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";
axios.defaults.baseURL = API_BASE;
userManager.applyAuthHeader(axios);

const difficultyLabel = (d) => {
  const map = { easy: "简单", medium: "中等", hard: "困难" };
  return map[d] || d || "未标注";
};

const RedoPage = () => {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState({});
  const [batchDeleteMode, setBatchDeleteMode] = useState(false);
  const [batchSelected, setBatchSelected] = useState({});
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [filters, setFilters] = useState({
    course: "",
    week: "",
    subtopic: "",
    difficulty: "",
  });

  const loadRecords = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/redo-records");
      if (res.data?.success) {
        setRecords(Array.isArray(res.data.records) ? res.data.records : []);
      } else {
        setRecords([]);
      }
    } catch (error) {
      console.warn("加载重做记录失败", error);
      alert("加载重做记录失败，请稍后重试");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const handleDelete = async (id) => {
    if (!id) return;
    const ok = window.confirm("确定删除这条重做记录吗？");
    if (!ok) return;

    setDeleting((prev) => ({ ...prev, [id]: true }));
    try {
      await axios.delete(`/api/redo-records/${id}`);
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (error) {
      console.warn("删除重做记录失败", error);
      alert("删除失败，请稍后重试");
    } finally {
      setDeleting((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const courseOptions = useMemo(
    () => Array.from(new Set(records.map((r) => r.course).filter(Boolean))),
    [records]
  );
  const weekOptions = useMemo(
    () => Array.from(new Set(records.map((r) => String(r.week ?? "")).filter(Boolean))),
    [records]
  );
  const subtopicOptions = useMemo(
    () => Array.from(new Set(records.map((r) => r.subtopic).filter(Boolean))),
    [records]
  );

  const filteredRecords = useMemo(
    () =>
      records.filter((r) => {
        if (filters.course && r.course !== filters.course) return false;
        if (filters.week && String(r.week ?? "") !== filters.week) return false;
        if (filters.subtopic && r.subtopic !== filters.subtopic) return false;
        if (filters.difficulty && r.difficulty !== filters.difficulty) return false;
        return true;
      }),
    [records, filters]
  );

  const selectedBatchIds = useMemo(
    () => filteredRecords.filter((r) => !!batchSelected[r.id]).map((r) => r.id),
    [filteredRecords, batchSelected]
  );

  const allBatchChecked =
    filteredRecords.length > 0 && filteredRecords.every((r) => !!batchSelected[r.id]);

  const startRedo = () => {
    if (filteredRecords.length === 0) {
      alert("当前筛选条件下没有可重做题目");
      return;
    }
    navigate(ROUTES.REDO_PLAY, { state: { items: filteredRecords } });
  };

  const enterBatchDeleteMode = () => {
    setBatchDeleteMode(true);
    setBatchSelected({});
  };

  const cancelBatchDeleteMode = () => {
    setBatchDeleteMode(false);
    setBatchSelected({});
  };

  const toggleSelectAllBatch = () => {
    if (allBatchChecked) {
      setBatchSelected({});
      return;
    }
    const next = {};
    filteredRecords.forEach((r) => {
      if (r.id) next[r.id] = true;
    });
    setBatchSelected(next);
  };

  const removeSelectedBatch = async () => {
    if (selectedBatchIds.length === 0) return;
    setBatchDeleting(true);
    try {
      await Promise.all(selectedBatchIds.map((id) => axios.delete(`/api/redo-records/${id}`)));
      const idSet = new Set(selectedBatchIds);
      setRecords((prev) => prev.filter((r) => !idSet.has(r.id)));
      setBatchDeleteMode(false);
      setBatchSelected({});
    } catch (error) {
      console.warn("批量删除重做记录失败", error);
      alert("批量删除失败，请稍后重试");
    } finally {
      setBatchDeleting(false);
    }
  };

  return (
    <div className="redo-wrapper">
      <Header />
      <div className="redo-content">
        <div className="redo-hero">
          <div>
            <div className="eyebrow">Redo Center</div>
            <h1>重做练习</h1>
            <p className="lede">按筛选范围直接开始重做，作答体验与测验一致。</p>
          </div>
          <div className="hero-actions">
            <button className="ghost" onClick={() => navigate(ROUTES.WRONG)}>
              返回错题
            </button>
            <button className="ghost" onClick={loadRecords} disabled={loading}>
              {loading ? "刷新中..." : "刷新"}
            </button>
            <button className="primary" onClick={startRedo} disabled={loading || filteredRecords.length === 0}>
              开始重做
            </button>
          </div>
        </div>

        <div className="filters">
          <select value={filters.course} onChange={(e) => setFilters((f) => ({ ...f, course: e.target.value }))}>
            <option value="">全部课程</option>
            {courseOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select value={filters.week} onChange={(e) => setFilters((f) => ({ ...f, week: e.target.value }))}>
            <option value="">全部周次</option>
            {weekOptions.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
          <select value={filters.subtopic} onChange={(e) => setFilters((f) => ({ ...f, subtopic: e.target.value }))}>
            <option value="">全部子主题</option>
            {subtopicOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select value={filters.difficulty} onChange={(e) => setFilters((f) => ({ ...f, difficulty: e.target.value }))}>
            <option value="">全部难度</option>
            <option value="easy">简单</option>
            <option value="medium">中等</option>
            <option value="hard">困难</option>
          </select>
          <button className="ghost" onClick={() => setFilters({ course: "", week: "", subtopic: "", difficulty: "" })}>
            清空筛选
          </button>
          {!batchDeleteMode ? (
            <button className="ghost" onClick={enterBatchDeleteMode} disabled={loading || filteredRecords.length === 0}>
              批量删除
            </button>
          ) : (
            <div className="batch-delete-controls">
              <button className="ghost" onClick={cancelBatchDeleteMode} disabled={batchDeleting}>
                取消
              </button>
              <button className="ghost" onClick={toggleSelectAllBatch} disabled={batchDeleting || filteredRecords.length === 0}>
                {allBatchChecked ? "取消全选" : "全选"}
              </button>
              <button className="ghost" onClick={removeSelectedBatch} disabled={batchDeleting || selectedBatchIds.length === 0}>
                {batchDeleting ? "删除中..." : "删除"}
              </button>
            </div>
          )}
        </div>

        {loading && <Loader style={{ display: "block" }}>正在加载重做记录...</Loader>}

        {!loading && filteredRecords.length === 0 && (
          <div className="empty-state">
            <p>暂无重做记录。你可以在错题集中将题目加入重做。</p>
          </div>
        )}

        <div className="redo-list">
          {filteredRecords.map((r, idx) => (
            <div className="redo-item" key={r.id || `${r.question_key || "q"}-${idx}`}>
              <div className="redo-item-head">
                <div className="redo-tags">
                  <span className="pill">{r.course || "课程"}</span>
                  <span className="pill pill-ghost">第{r.week || "-"}周</span>
                  <span className="pill pill-ghost">{r.subtopic || "子主题"}</span>
                  <span className="pill">{difficultyLabel(r.difficulty)}</span>
                  {r.created_at && <span className="pill pill-ghost">{new Date(r.created_at).toLocaleString()}</span>}
                </div>
                <div className={`redo-actions-inline ${batchDeleteMode ? "batch-mode" : ""}`}>
                  {batchDeleteMode ? (
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={!!batchSelected[r.id]}
                        onChange={(e) =>
                          setBatchSelected((prev) => ({
                            ...prev,
                            [r.id]: e.target.checked,
                          }))
                        }
                      />
                      选择
                    </label>
                  ) : (
                    <button className="ghost" onClick={() => handleDelete(r.id)} disabled={!!deleting[r.id]}>
                      {deleting[r.id] ? "删除中..." : "删除"}
                    </button>
                  )}
                </div>
              </div>

              <div className="redo-question">{r.question || "(题干缺失)"}</div>
              <div className="redo-answers">
                <span>上次答案：{r.attempt_answer || "(未记录)"}</span>
                <span>正确答案：{r.correct_answer || "(未提供)"}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RedoPage;
