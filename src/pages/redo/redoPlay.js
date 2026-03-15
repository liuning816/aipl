import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import Header from "../../components/header/header";
import Loader from "../../components/loader/loader";
import userManager from "../../utils/userManager";
import { ROUTES } from "../../routes";
import "./redo.css";
import "../quiz/quiz.css";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";
axios.defaults.baseURL = API_BASE;
userManager.applyAuthHeader(axios);

const normalizeType = (t) => {
  const s = (t || "").toString().toLowerCase().trim();
  if (["single_choice", "single-choice", "single choice", "single"].includes(s)) return "single_choice";
  if (["multiple_choice", "multiple-choice", "multiple choice", "multi", "multi_choice"].includes(s)) return "multiple_choice";
  if (["true_false", "true-false", "truefalse", "boolean", "tf"].includes(s)) return "true_false";
  return s || "short_answer";
};

const normalizeOptions = (type, opts) => {
  if (type === "true_false") return ["True", "False"];
  if (Array.isArray(opts)) return opts.map((o) => String(o));
  if (typeof opts === "string") {
    const lines = opts
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (lines.length > 1) return lines;
    const parts = opts
      .split(/[,;]/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (parts.length > 1) return parts;
    return opts.trim() ? [opts.trim()] : [];
  }
  return [];
};

const parseCorrectIndices = (correct, options) => {
  const out = [];
  const pushOne = (v) => {
    if (typeof v === "number" && v >= 0 && v < options.length) {
      out.push(v);
      return;
    }
    if (typeof v !== "string") return;
    const s = v.trim();
    if (!s) return;

    if (/^[A-Za-z]/.test(s)) {
      const idx = s[0].toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < options.length) {
        out.push(idx);
        return;
      }
    }

    const byText = options.findIndex((o) => o.trim() === s);
    if (byText !== -1) out.push(byText);
  };

  if (Array.isArray(correct)) {
    correct.forEach(pushOne);
  } else if (typeof correct === "string" && (correct.includes(",") || correct.includes("，"))) {
    correct
      .split(/[,，]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach(pushOne);
  } else {
    pushOne(correct);
  }

  return Array.from(new Set(out));
};

const RedoPlayPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState(() => location.state?.items || []);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/redo-records");
      if (res.data?.success) {
        const list = Array.isArray(res.data.records) ? res.data.records : [];
        if (list.length === 0) {
          alert("暂无重做记录，请先在错题集中添加题目");
          navigate(ROUTES.REDO);
          return;
        }
        setItems(list);
      }
    } catch (error) {
      console.warn("加载重做记录失败", error);
      alert("加载重做记录失败");
      navigate(ROUTES.REDO);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (!items || items.length === 0) {
      fetchAll();
    }
  }, [fetchAll, items]);

  const setChoice = (id, idx, isMulti) => {
    setAnswers((prev) => {
      const current = prev[id] || {};
      const selected = current.selectedOptions || [];
      const next = isMulti
        ? selected.includes(idx)
          ? selected.filter((x) => x !== idx)
          : [...selected, idx]
        : [idx];
      return { ...prev, [id]: { ...current, selectedOptions: next } };
    });
  };

  const setText = (id, text) => {
    setAnswers((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), text } }));
  };

  const submitOne = async (item, qid) => {
    setAnswers((prev) => ({ ...prev, [qid]: { ...(prev[qid] || {}), submitted: true } }));

    try {
      const ua = answers[qid] || {};
      const qtype = normalizeType(item.type || item.question?.type);
      const options = normalizeOptions(qtype, item.options || item.question?.options);
      const selected = ua.selectedOptions || [];
      const attempt = selected.length > 0 ? selected.map((i) => options[i] || String.fromCharCode(65 + i)).join(", ") : (ua.text || "").trim();

      await axios.post("/api/wrong-questions/redo-log", {
        question_key: item.question_key,
        attempt_answer: attempt,
        correct_answer: item.correct_answer,
        difficulty: item.difficulty,
      });
    } catch (error) {
      console.warn("记录重做日志失败", error);
    }
  };

  const rendered = useMemo(() => items || [], [items]);

  if (loading) {
    return (
      <div className="redo-wrapper">
        <Header />
        <div className="redo-play-shell">
          <Loader style={{ display: "block", marginTop: "24px" }}>正在加载重做题目...</Loader>
        </div>
      </div>
    );
  }

  return (
    <div className="redo-wrapper">
      <Header />
      <div className="redo-play-shell">
        <div className="redo-hero">
          <div>
            <div className="eyebrow">Redo Session</div>
            <h1>开始重做</h1>
            <p className="lede">题目来源于重做列表，作答后会写入错题重做历史。</p>
          </div>
          <div className="hero-actions">
            <button className="ghost" onClick={() => navigate(ROUTES.REDO)}>
              返回列表
            </button>
          </div>
        </div>

        {rendered.length === 0 && (
          <div className="empty-state">
            <p>暂无重做题目，请返回列表选择题目。</p>
          </div>
        )}

        <div className="redo-session-list">
          {rendered.map((item, index) => {
            const id = item.id || item.question_key || `q-${index}`;
            const qtype = normalizeType(item.type || item.question?.type);
            const options = normalizeOptions(qtype, item.options || item.question?.options);
            const isChoice = ["single_choice", "multiple_choice", "true_false"].includes(qtype);
            const correctIndices = isChoice ? parseCorrectIndices(item.correct_answer, options) : [];
            const isMulti = qtype === "multiple_choice" || correctIndices.length > 1;
            const ua = answers[id] || {};
            const submitted = !!ua.submitted;

            return (
              <div className="redo-question-card" key={id}>
                <div className="redo-question-head">
                  <div className="redo-meta">
                    <span>{item.course || "课程"}</span>
                    <span>第{item.week || "-"}周</span>
                    <span>{item.subtopic || "子主题"}</span>
                  </div>
                </div>

                <h3>
                  <span style={{ marginRight: "1ch" }}>{index + 1}.</span>
                  {item.question || item.question?.question || "(题干缺失)"}
                </h3>

                {isChoice && options.length > 0 && (
                  <div className="flexbox options">
                    {options.map((opt, i) => {
                      const selected = (ua.selectedOptions || []).includes(i);
                      const correct = submitted && correctIndices.includes(i);
                      const wrong = submitted && selected && !correctIndices.includes(i);
                      const missed = submitted && !selected && correctIndices.includes(i);
                      const cls = correct ? "correct" : wrong ? "wrong" : missed ? "missed" : "";

                      return (
                        <div
                          key={i}
                          className={`option ${cls} ${selected ? "selected" : ""} ${submitted ? "attempted" : ""}`}
                          onClick={() => !submitted && setChoice(id, i, isMulti)}
                        >
                          <span className="option-marker">{String.fromCharCode(65 + i)}.</span>
                          <span className="option-text">{opt}</span>
                        </div>
                      );
                    })}

                    {!submitted && (ua.selectedOptions || []).length > 0 && (
                      <button className="confirm-button" onClick={() => submitOne(item, id)}>
                        确认答案
                      </button>
                    )}

                    {submitted && (
                      <div className="answer-result">
                        <div className="correct-answer">
                          正确答案：
                          {correctIndices.length > 0
                            ? correctIndices.map((ci) => `${String.fromCharCode(65 + ci)}. ${options[ci] || ""}`).join("；")
                            : item.correct_answer || "(未提供)"}
                        </div>
                        {(item.explanation || item.reason) && (
                          <div className="reason">
                            <strong>解析：</strong>
                            {item.explanation || item.reason}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!isChoice && (
                  <div className="flexbox options">
                    <textarea
                      className="answer-input"
                      value={ua.text || ""}
                      onChange={(e) => setText(id, e.target.value)}
                      placeholder="请在此输入你的答案..."
                      disabled={submitted}
                    />

                    {!submitted && (ua.text || "").trim().length > 0 && (
                      <button className="confirm-button" onClick={() => submitOne(item, id)}>
                        确认答案
                      </button>
                    )}

                    {submitted && (
                      <div className="answer-result">
                        <div className="correct-answer">正确答案：{item.correct_answer || "(未提供)"}</div>
                        {(item.explanation || item.reason) && (
                          <div className="reason">
                            <strong>解析：</strong>
                            {item.explanation || item.reason}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="redo-bottom-back">
          <button className="ghost ghost-xl" onClick={() => navigate(ROUTES.REDO)}>
            返回重做列表
          </button>
        </div>
      </div>
    </div>
  );
};

export default RedoPlayPage;
