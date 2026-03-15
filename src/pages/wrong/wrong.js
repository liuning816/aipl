import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import Header from "../../components/header/header";
import Loader from "../../components/loader/loader";
import userManager from "../../utils/userManager";
import { ROUTES } from "../../routes";
import "./wrong.css";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";
axios.defaults.baseURL = API_BASE;
userManager.applyAuthHeader(axios);

const difficultyLabel = (d) => {
	const map = { easy: "简单", medium: "中等", hard: "困难" };
	return map[d] || d || "未标注";
};

const buildQuestionObject = (record) => ({
	question: record.question,
	options: record.options,
	type: record.type,
	explanation: record.explanation,
});

const normalizeType = (t) => {
	const s = (t || "").toString().toLowerCase().trim();
	if (["single_choice", "single-choice", "single choice", "single"].includes(s)) return "single_choice";
	if (["multiple_choice", "multiple-choice", "multiple choice", "multi", "multi_choice"].includes(s)) return "multiple_choice";
	if (["true_false", "true-false", "truefalse", "boolean", "tf"].includes(s)) return "true_false";
	return s || "short_answer";
};

const normalizeOptions = (type, options) => {
	if (type === "true_false") return ["True", "False"];
	if (Array.isArray(options)) return options.map((o) => String(o));
	if (typeof options === "string") {
		const lines = options
			.split(/\r?\n/)
			.map((x) => x.trim())
			.filter(Boolean);
		if (lines.length > 1) return lines;
		const parts = options
			.split(/[,;]/)
			.map((x) => x.trim())
			.filter(Boolean);
		if (parts.length > 1) return parts;
		return options.trim() ? [options.trim()] : [];
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

const normalizeAnswerTokens = (answer) => {
	const s = String(answer || "").trim().toLowerCase();
	if (!s) return [];
	const parts = s
		.split(/[;,，；]/)
		.map((x) => x.trim())
		.filter(Boolean)
		.sort();
	return parts.length > 1 ? parts : [s];
};

const isRedoEntryCorrect = (entry) => {
	const attempt = normalizeAnswerTokens(entry?.attempt_answer);
	const correct = normalizeAnswerTokens(entry?.correct_answer);
	if (attempt.length === 0 || correct.length === 0) return false;
	if (attempt.length !== correct.length) return false;
	return attempt.every((v, i) => v === correct[i]);
};

const hasRecentThreeCorrect = (redoHistory) => {
	if (!Array.isArray(redoHistory) || redoHistory.length < 3) return false;
	const latestThree = redoHistory
		.slice()
		.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
		.slice(0, 3);
	return latestThree.every(isRedoEntryCorrect);
};

const WrongPage = () => {
	const navigate = useNavigate();
	const location = useLocation();
	const [records, setRecords] = useState([]);
	const [loading, setLoading] = useState(false);
	const [submittingRedo, setSubmittingRedo] = useState(false);
	const [selectedKeys, setSelectedKeys] = useState({});
	const [noteDrafts, setNoteDrafts] = useState({});
	const [savingNotes, setSavingNotes] = useState({});
	const [deleting, setDeleting] = useState({});
	const [showRedoHistory, setShowRedoHistory] = useState({});
	const [singleRedoActive, setSingleRedoActive] = useState({});
	const [redoAnswers, setRedoAnswers] = useState({});
	const [singleRedoSubmitting, setSingleRedoSubmitting] = useState({});
	const [redoJoinModal, setRedoJoinModal] = useState({ open: false, count: 0 });
	const [deleteConfirmModal, setDeleteConfirmModal] = useState({ open: false, mode: "single", record: null });
	const [filters, setFilters] = useState({
		course: "",
		week: "",
		subtopic: "",
		difficulty: "",
		keyword: "",
	});

	const loadWrongQuestions = async () => {
		setLoading(true);
		try {
			const response = await axios.get("/api/wrong-questions");
			const list = response.data?.success ? response.data.records || [] : [];
			setRecords(list);

			const initNotes = {};
			list.forEach((r) => {
				initNotes[r.question_key] = r.note || "";
			});
			setNoteDrafts(initNotes);
		} catch (error) {
			console.warn("加载错题集失败", error);
			alert("加载错题集失败，请稍后重试");
			setRecords([]);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadWrongQuestions();
	}, []);

	useEffect(() => {
		const params = new URLSearchParams(location.search || "");
		const course = (params.get("course") || "").trim();
		const subtopic = (params.get("subtopic") || "").trim();
		const keyword = (params.get("keyword") || "").trim();

		if (!course && !subtopic && !keyword) return;

		setFilters((prev) => ({
			...prev,
			course: course || prev.course,
			subtopic: subtopic || prev.subtopic,
			keyword: keyword || prev.keyword,
		}));
	}, [location.search]);

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

	const filteredRecords = useMemo(() => {
		const keyword = (filters.keyword || "").trim().toLowerCase();
		return records.filter((r) => {
			if (filters.course && r.course !== filters.course) return false;
			if (filters.week && String(r.week ?? "") !== filters.week) return false;
			if (filters.subtopic && r.subtopic !== filters.subtopic) return false;
			if (filters.difficulty && r.difficulty !== filters.difficulty) return false;
			if (keyword) {
				const q = (r.question || "").toLowerCase();
				if (!q.includes(keyword)) return false;
			}
			return true;
		});
	}, [records, filters]);

	const selectedList = useMemo(
		() => filteredRecords.filter((r) => !!selectedKeys[r.question_key]),
		[filteredRecords, selectedKeys]
	);

	const toggleSelectAllCurrent = (checked) => {
		setSelectedKeys((prev) => {
			const next = { ...prev };
			filteredRecords.forEach((r) => {
				next[r.question_key] = checked;
			});
			return next;
		});
	};

	const executeDelete = async (targets) => {
		if (!Array.isArray(targets) || targets.length === 0) return;
		const keys = targets.map((r) => r.question_key).filter(Boolean);
		if (keys.length === 0) return;

		setDeleting((prev) => {
			const next = { ...prev };
			keys.forEach((k) => {
				next[k] = true;
			});
			return next;
		});

		try {
			await Promise.all(keys.map((k) => axios.post("/api/wrong-questions/delete", { question_key: k })));
			const keySet = new Set(keys);
			setRecords((prev) => prev.filter((r) => !keySet.has(r.question_key)));
			setSelectedKeys((prev) => {
				const next = { ...prev };
				keys.forEach((k) => delete next[k]);
				return next;
			});
		} catch (error) {
			console.warn("删除错题失败", error);
			alert("删除失败，请稍后重试");
		} finally {
			setDeleting((prev) => {
				const next = { ...prev };
				keys.forEach((k) => delete next[k]);
				return next;
			});
		}
	};

	const openSingleDeleteConfirm = (record) => {
		if (!record?.question_key) return;
		setDeleteConfirmModal({ open: true, mode: "single", record });
	};

	const openBulkDeleteConfirm = () => {
		if (selectedList.length === 0) return;
		setDeleteConfirmModal({ open: true, mode: "bulk", record: null });
	};

	const closeDeleteConfirm = () => {
		setDeleteConfirmModal({ open: false, mode: "single", record: null });
	};

	const confirmDelete = async () => {
		const targets =
			deleteConfirmModal.mode === "single"
				? deleteConfirmModal.record
					? [deleteConfirmModal.record]
					: []
				: selectedList;
		closeDeleteConfirm();
		await executeDelete(targets);
	};

	const saveNote = async (record) => {
		const qk = record?.question_key;
		if (!qk) return;
		setSavingNotes((prev) => ({ ...prev, [qk]: true }));
		try {
			await axios.post("/api/wrong-questions/note", {
				question_key: qk,
				note: noteDrafts[qk] || "",
			});
			setRecords((prev) => prev.map((r) => (r.question_key === qk ? { ...r, note: noteDrafts[qk] || "" } : r)));
		} catch (error) {
			console.warn("保存笔记失败", error);
			alert("保存笔记失败，请稍后重试");
		} finally {
			setSavingNotes((prev) => {
				const next = { ...prev };
				delete next[qk];
				return next;
			});
		}
	};

	const addSelectedToRedo = async () => {
		if (selectedList.length === 0) {
			alert("请先勾选要加入重做的题目");
			return;
		}

		setSubmittingRedo(true);
		try {
			const grouped = {};
			selectedList.forEach((r) => {
				const key = `${r.course}__${r.week}__${r.subtopic}`;
				if (!grouped[key]) grouped[key] = [];
				grouped[key].push(r);
			});

			const entries = Object.values(grouped);
			for (const group of entries) {
				const first = group[0];
				await axios.post("/api/redo-records", {
					course: first.course,
					week: String(first.week),
					subtopic: String(first.subtopic),
					items: group.map((r) => ({
						question_key: r.question_key,
						question: buildQuestionObject(r),
						correct_answer: r.correct_answer,
						attempt_answer: r.user_answer,
						difficulty: r.difficulty,
					})),
				});
			}

			setRedoJoinModal({ open: true, count: selectedList.length });
			setSelectedKeys({});
		} catch (error) {
			console.warn("加入重做失败", error);
			alert("加入重做失败，请稍后重试");
		} finally {
			setSubmittingRedo(false);
		}
	};

	const toggleInlineRedo = (qk) => {
		setSingleRedoActive((prev) => ({ ...prev, [qk]: !prev[qk] }));
	};

	const selectInlineOption = (qk, optionIndex, isMulti) => {
		setRedoAnswers((prev) => {
			const current = prev[qk] || {};
			const selected = current.selectedOptions || [];
			const next = isMulti
				? selected.includes(optionIndex)
					? selected.filter((x) => x !== optionIndex)
					: [...selected, optionIndex]
				: [optionIndex];
			return { ...prev, [qk]: { ...current, selectedOptions: next } };
		});
	};

	const setInlineText = (qk, text) => {
		setRedoAnswers((prev) => ({ ...prev, [qk]: { ...(prev[qk] || {}), text } }));
	};

	const submitSingleRedo = async (record) => {
		const qk = record?.question_key;
		if (!qk) return;

		const qtype = normalizeType(record.type);
		const options = normalizeOptions(qtype, record.options);
		const isChoice = ["single_choice", "multiple_choice", "true_false"].includes(qtype);
		const answerState = redoAnswers[qk] || {};
		const selected = answerState.selectedOptions || [];
		const text = (answerState.text || "").trim();

		const attemptAnswer = isChoice
			? selected.map((idx) => options[idx] || String.fromCharCode(65 + idx)).join(", ")
			: text;

		if (!attemptAnswer) {
			alert("请先作答再提交");
			return;
		}

		setSingleRedoSubmitting((prev) => ({ ...prev, [qk]: true }));
		try {
			await axios.post("/api/wrong-questions/redo-log", {
				question_key: qk,
				attempt_answer: attemptAnswer,
				correct_answer: record.correct_answer,
				difficulty: record.difficulty,
			});

			const nowIso = new Date().toISOString();
			setRecords((prev) =>
				prev.map((r) => {
					if (r.question_key !== qk) return r;
					const history = Array.isArray(r.redo_history) ? [...r.redo_history] : [];
					history.push({
						attempt_answer: attemptAnswer,
						correct_answer: record.correct_answer,
						difficulty: record.difficulty,
						created_at: nowIso,
					});
					return { ...r, redo_history: history };
				})
			);

			setSingleRedoActive((prev) => ({ ...prev, [qk]: false }));
			setRedoAnswers((prev) => {
				const next = { ...prev };
				delete next[qk];
				return next;
			});
			setShowRedoHistory((prev) => ({ ...prev, [qk]: true }));
		} catch (error) {
			console.warn("提交单题重做失败", error);
			alert("提交失败，请稍后重试");
		} finally {
			setSingleRedoSubmitting((prev) => {
				const next = { ...prev };
				delete next[qk];
				return next;
			});
		}
	};

	const allCurrentChecked = filteredRecords.length > 0 && filteredRecords.every((r) => !!selectedKeys[r.question_key]);

	const closeRedoJoinModal = () => {
		setRedoJoinModal({ open: false, count: 0 });
	};

	const gotoRedoFromModal = () => {
		setRedoJoinModal({ open: false, count: 0 });
		navigate(ROUTES.REDO);
	};

	return (
		<div className="wrong-wrapper">
			<Header />
			<div className="wrong-content">
				<div className="wrong-hero">
					<div className="eyebrow">Wrong Questions</div>
					<h1>错题集</h1>
					<p className="lede">管理你的薄弱题目，支持筛选、笔记、批量加入重做。</p>
				</div>

				<div className="filters" style={{ marginBottom: 12 }}>
					<input
						value={filters.keyword}
						onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value }))}
						placeholder="搜索题干关键词"
					/>
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
				</div>

				<div className="toolbar">
					<div>
						当前 {filteredRecords.length} 题，已勾选 {selectedList.length} 题
					</div>
					<div>
						<button className="ghost" onClick={() => toggleSelectAllCurrent(!allCurrentChecked)}>
							{allCurrentChecked ? "取消全选" : "全选当前"}
						</button>
						<button className="ghost" onClick={loadWrongQuestions} disabled={loading}>
							{loading ? "刷新中..." : "刷新"}
						</button>
						<button className="ghost" onClick={openBulkDeleteConfirm} disabled={selectedList.length === 0}>
							批量删除
						</button>
						<button onClick={addSelectedToRedo} disabled={submittingRedo || selectedList.length === 0}>
							{submittingRedo ? "加入中..." : "加入重做"}
						</button>
					</div>
				</div>

				{loading && <Loader style={{ display: "block" }}>正在加载错题集...</Loader>}

				{!loading && filteredRecords.length === 0 && (
					<div className="empty-state">
						<p>暂无错题记录。完成测验后答错的题会自动出现在这里。</p>
					</div>
				)}

				<div className="wrong-list">
					{filteredRecords.map((record, idx) => {
						const qk = record.question_key;
						return (
							<div className="wrong-card" key={qk || record.id || idx}>
								<div className="card-head">
									<div>
										<div className="meta">
											{record.course || "课程"} | 第{record.week || "-"}周 | {record.subtopic || "子主题"}
										</div>
										<h3>{record.question || "(题干缺失)"}</h3>
									</div>
									<div className="card-actions">
										<label className="checkbox">
											<input
												type="checkbox"
												checked={!!selectedKeys[qk]}
												onChange={(e) => setSelectedKeys((prev) => ({ ...prev, [qk]: e.target.checked }))}
											/>
											加入重做
										</label>
										<button className="ghost" onClick={() => toggleInlineRedo(qk)}>
											{singleRedoActive[qk] ? "取消重做" : "单题重做"}
										</button>
										<button
											className="ghost"
											onClick={() =>
												setShowRedoHistory((prev) => ({ ...prev, [qk]: !prev[qk] }))
											}
										>
											{showRedoHistory[qk] ? "隐藏重做记录" : "查看重做记录"}
										</button>
										<button className="ghost" onClick={() => openSingleDeleteConfirm(record)} disabled={!!deleting[qk]}>
											{deleting[qk] ? "删除中..." : "删除"}
										</button>
									</div>
								</div>

								<div className="tags" style={{ marginTop: 6 }}>
									<span className="pill">{difficultyLabel(record.difficulty)}</span>
									{hasRecentThreeCorrect(record.redo_history) && <span className="pill pill-success">最近连续三次都回答正确</span>}
									{record.source && <span className="pill pill-ghost">来源: {record.source}</span>}
									{record.updated_at && <span className="pill pill-ghost">更新: {new Date(record.updated_at).toLocaleString()}</span>}
								</div>

								{singleRedoActive[qk] ? (
									(() => {
										const qtype = normalizeType(record.type);
										const options = normalizeOptions(qtype, record.options);
										const isChoice = ["single_choice", "multiple_choice", "true_false"].includes(qtype);
										const correctIndices = parseCorrectIndices(record.correct_answer, options);
										const isMulti = qtype === "multiple_choice" || correctIndices.length > 1;
										const answer = redoAnswers[qk] || {};

										return (
											<div className="redo-mode">
												<div className="redo-head">单题重做</div>
												{isChoice && options.length > 0 ? (
													<div className="redo-options">
														{options.map((opt, idx2) => {
															const selected = (answer.selectedOptions || []).includes(idx2);
															return (
																<div
																	key={`${qk}-opt-${idx2}`}
																	className={`redo-option ${selected ? "selected" : ""}`}
																	onClick={() => selectInlineOption(qk, idx2, isMulti)}
																>
																	<span>{String.fromCharCode(65 + idx2)}.</span>
																	<span>{opt}</span>
																</div>
															);
														})}
													</div>
												) : (
													<textarea
														className="redo-text"
														value={answer.text || ""}
														onChange={(e) => setInlineText(qk, e.target.value)}
														placeholder="请输入你的本次答案"
													/>
												)}
												<div style={{ marginTop: 8 }}>
													<button className="primary" onClick={() => submitSingleRedo(record)} disabled={!!singleRedoSubmitting[qk]}>
														{singleRedoSubmitting[qk] ? "提交中..." : "确认答案"}
													</button>
												</div>
											</div>
										);
									})()
								) : (
									<div className="answer-grid">
										<div className="answer-block half">
											<span className="answer-title">你的答案</span>
											<div className="answer-text">{record.user_answer || "(未记录)"}</div>
										</div>
										<div className="answer-block half">
											<span className="answer-title">正确答案</span>
											<div className="answer-text">{record.correct_answer || "(未提供)"}</div>
										</div>
										{!!record.explanation && (
											<div className="answer-block full explanation-block">
												<span className="answer-title">解析</span>
												<div className="answer-text">{record.explanation}</div>
											</div>
										)}
									</div>
								)}

								<div className="note-row">
									<textarea
										value={noteDrafts[qk] || ""}
										onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [qk]: e.target.value }))}
										placeholder="添加你的错题笔记（可选）"
									/>
									<button className="note-save" onClick={() => saveNote(record)} disabled={!!savingNotes[qk]}>
										{savingNotes[qk] ? "保存中..." : "保存笔记"}
									</button>
								</div>

								{showRedoHistory[qk] && (
									<div className="redo-history">
										<div className="redo-head">重做记录</div>
										{Array.isArray(record.redo_history) && record.redo_history.length > 0 ? (
											<ul>
												{record.redo_history
													.slice()
													.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
													.map((item, i) => (
														<li key={`${qk}-redo-${i}`}>
															<span className="pill pill-ghost">{item.created_at ? new Date(item.created_at).toLocaleString() : "时间未知"}</span>
															<span>作答: {item.attempt_answer || "(未记录)"}</span>
															<span>正确: {item.correct_answer || record.correct_answer || "(未提供)"}</span>
														</li>
													))}
											</ul>
										) : (
											<div className="redo-empty">暂无重做记录，点击“单题重做”后会在这里显示。</div>
										)}
									</div>
								)}
							</div>
						);
					})}
				</div>

				{redoJoinModal.open && (
					<div className="redo-join-modal-mask" role="dialog" aria-modal="true">
						<div className="redo-join-modal-card">
							<div className="redo-join-modal-title">已加入重做集：{redoJoinModal.count}题</div>
							<div className="redo-join-modal-actions">
								<button className="ghost" onClick={closeRedoJoinModal}>确认</button>
								<button className="primary" onClick={gotoRedoFromModal}>前往重做集</button>
							</div>
						</div>
					</div>
				)}

				{deleteConfirmModal.open && (
					<div className="delete-confirm-modal-mask" role="dialog" aria-modal="true">
						<div className="delete-confirm-modal-card">
							<div className="delete-confirm-modal-message">
								{deleteConfirmModal.mode === "bulk" ? "确认从错题集中移除这些题目吗" : "确认从错题集中移除这道题吗"}
							</div>
							<div className="delete-confirm-modal-actions">
								<button className="ghost" onClick={confirmDelete}>确认</button>
								<button className="primary" onClick={closeDeleteConfirm}>取消</button>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

export default WrongPage;
