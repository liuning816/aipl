import { useCallback, useEffect, useState, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import Header from "../../components/header/header";
import Loader from "../../components/loader/loader";
import Modal from "../../components/modal/modal";
import userManager from "../../utils/userManager";
import { ROUTES } from "../../routes";
import {
  Bell,
  BookOpen,
  CloudUpload,
  FileBox,
  Lock,
  Send,
  Star,
} from "lucide-react";
import "./questionbank.css";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";
axios.defaults.baseURL = API_BASE;
userManager.applyAuthHeader(axios);

const QuestionBankPage = () => {
      // 规范化选项数组
      const normalizeQuizOptions = useCallback((options) => {
        if (Array.isArray(options)) return options.map((opt) => String(opt));
        if (typeof options === "string") {
          const rows = options
            .split(/\r?\n|[,;，；]/)
            .map((v) => v.trim())
            .filter(Boolean);
          return rows;
        }
        return [];
      }, []);
    // 解析选项token为下标
    const parseChoiceTokenToIndex = useCallback((token, options) => {
      if (typeof token === "number") {
        if (token >= 0 && token < options.length) return token;
        if (token >= 1 && token <= options.length) return token - 1;
        return null;
      }
      const text = String(token || "").trim();
      if (!text) return null;
      if (/^[A-Za-z]$/.test(text)) {
        const idx = text.toUpperCase().charCodeAt(0) - 65;
        return idx >= 0 && idx < options.length ? idx : null;
      }
      if (/^\d+$/.test(text)) {
        const num = Number(text);
        if (num >= 0 && num < options.length) return num;
        if (num >= 1 && num <= options.length) return num - 1;
      }
      {
        const exact = options.findIndex((opt) => String(opt).trim() === text);
        if (exact !== -1) return exact;
      }
      return null;
    }, []);
  // 上传相关
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFileName(file.name);
    setErrorText("");
    setSuccessText("");
    try {
      const formDataObj = new FormData();
      formDataObj.append("file", file);
      const res = await axios.post("/api/upload-questions", formDataObj, {
        headers: { "Content-Type": "multipart/form-data" },
        withCredentials: true,
      });
      const data = res.data?.data;
      if (!data) throw new Error("未识别到题目内容");
      // 自动进入草稿编辑模式
      setDraftMode(true);
      setFormData((prev) => ({
        ...prev,
        title: data.title || "",
        description: data.description || "",
        tagsText: (data.tags || []).join(","),
        content_type: data.content_type || "paper",
        contentText: data.content || "",
        paperItemsText: (data.items || []).map((q) => q.question).join("\n"),
      }));
      setDraftPaperItems((data.items || []).map((item, idx) => makeDraftItem(item, idx)));
      setSuccessText("文件解析成功，请完善题目后确认上传");
    } catch (err) {
      setErrorText(err?.response?.data?.error || err.message || "文件解析失败");
      setDraftMode(false);
    }
  };
  const handleFileDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      fileInputRef.current.files = e.dataTransfer.files;
      handleFileChange({ target: { files: e.dataTransfer.files } });
    }
  };
  const fileInputRef = useRef();
  const [uploadingFileName, setUploadingFileName] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const topic = searchParams.get("topic") || "";
  const week = searchParams.get("week") || "";
  const subtopic = searchParams.get("subtopic") || "";
  const initialTag = searchParams.get("tag") || topic || "";

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [uploadedDetailModalOpen, setUploadedDetailModalOpen] = useState(false);
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizTitle, setQuizTitle] = useState("");
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState({});
  const [showUploadCancelPrompt, setShowUploadCancelPrompt] = useState(false);
  const [uploadCancelTarget, setUploadCancelTarget] = useState(null);
  const [favoriteMissingCount, setFavoriteMissingCount] = useState(0);
  const [reportingId, setReportingId] = useState("");
  const [reportReason, setReportReason] = useState("错误答案");
  const [reportDetail, setReportDetail] = useState("");
  const [activeNav, setActiveNav] = useState("public");
  const [pagination, setPagination] = useState({ limit: 12, skip: 0, total: 0, count: 0, has_more: false });
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");
  const [filters, setFilters] = useState({ content_type: "", tag: initialTag, visibility: "all" });
  const [draftMode, setDraftMode] = useState(false);
  const [draftPaperItems, setDraftPaperItems] = useState([]);
  const [editingContentId, setEditingContentId] = useState("");
  const [editingOriginalContent, setEditingOriginalContent] = useState(null);
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  const [showUnsavedClosePrompt, setShowUnsavedClosePrompt] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    tagsText: initialTag || "",
    content_type: "single_question",
    visibility: "public",
    difficulty: "medium",
    source: "user_original",
    contentText: "",
    paperItemsText: "",
  });

  const makeDraftItem = useCallback((item, idx) => {
    const options = Array.isArray(item?.options) ? item.options : [];
    return {
      id: item?.id || idx + 1,
      question: item?.question || item?.text || "",
      options: options.map((o) => String(o)),
      answer: item?.answer ?? item?.correctAnswer ?? item?.modelAnswer ?? "",
      explanation: item?.explanation || item?.reason || "",
      subtopic: item?.subtopic || "",
    };
  }, []);

  const normalizeCorrectAnswerIndices = useCallback((rawAnswer, options) => {
    if (!options.length) return [];
    const source = Array.isArray(rawAnswer)
      ? rawAnswer
      : String(rawAnswer || "")
        .split(/[,，]/)
        .map((v) => v.trim())
        .filter(Boolean);
    const indices = source
      .map((token) => parseChoiceTokenToIndex(token, options))
      .filter((idx) => idx !== null);
    return Array.from(new Set(indices));
  }, [parseChoiceTokenToIndex]);

  const buildQuizQuestionsFromContent = useCallback((doc) => {
    if (!doc || typeof doc !== "object") return [];
    const rows = doc.content_type === "paper"
      ? (Array.isArray(doc.items) ? doc.items : [])
      : [doc.content || {}];

    return rows
      .map((row, idx) => {
        const options = normalizeQuizOptions(row?.options);
        const answer = row?.answer ?? row?.correctAnswer ?? row?.modelAnswer ?? "";
        const answerIndices = normalizeCorrectAnswerIndices(answer, options);
        const multi = answerIndices.length > 1 || String(row?.type || "").toLowerCase() === "multiple_choice";
        return {
          id: row?.id || idx + 1,
          question: row?.question || row?.text || `第 ${idx + 1} 题`,
          options,
          answerText: answer,
          answerIndices,
          explanation: row?.explanation || row?.reason || "",
          multi,
        };
      })
      .filter((q) => q.question);
  }, [normalizeCorrectAnswerIndices, normalizeQuizOptions]);

  const openPracticeModal = useCallback(async (item) => {
    if (!item?.id) return;
    setQuizModalOpen(true);
    setQuizLoading(true);
    setQuizQuestions([]);
    setQuizAnswers({});
    setQuizSubmitted({});
    setQuizIndex(0);
    setQuizTitle(item.title || "题库测试");
    setErrorText("");

    try {
      const res = await axios.get(`/api/question-bank/contents/${item.id}`, { withCredentials: true });
      const detail = res.data?.data || null;
      const nextQuestions = buildQuizQuestionsFromContent(detail);
      if (!nextQuestions.length) {
        setErrorText("当前内容暂无可测试题目");
      }
      setQuizTitle(detail?.title || item.title || "题库测试");
      setQuizQuestions(nextQuestions);
    } catch (err) {
      setErrorText(err?.response?.data?.error || "加载测试题失败");
      setQuizQuestions([]);
    } finally {
      setQuizLoading(false);
    }
  }, [buildQuizQuestionsFromContent]);

  const currentQuizQuestion = quizQuestions[quizIndex] || null;
  const currentQuizSelections = currentQuizQuestion ? (quizAnswers[currentQuizQuestion.id] || []) : [];
  const currentQuizSubmitted = currentQuizQuestion ? !!quizSubmitted[currentQuizQuestion.id] : false;

  const selectQuizOption = (optionIndex) => {
    if (!currentQuizQuestion || currentQuizSubmitted) return;
    const qid = currentQuizQuestion.id;
    setQuizAnswers((prev) => {
      const current = prev[qid] || [];
      if (currentQuizQuestion.multi) {
        const exists = current.includes(optionIndex);
        return {
          ...prev,
          [qid]: exists ? current.filter((idx) => idx !== optionIndex) : [...current, optionIndex],
        };
      }
      return {
        ...prev,
        [qid]: [optionIndex],
      };
    });
  };

  const submitCurrentQuizQuestion = () => {
    if (!currentQuizQuestion) return;
    setQuizSubmitted((prev) => ({ ...prev, [currentQuizQuestion.id]: true }));
  };

  const closeQuizModal = () => {
    setQuizModalOpen(false);
    setQuizLoading(false);
    setQuizTitle("");
    setQuizQuestions([]);
    setQuizAnswers({});
    setQuizSubmitted({});
    setQuizIndex(0);
  };

  const fetchContents = useCallback(async () => {
    setLoading(true);
    setErrorText("");
    try {
      let requestedVisibility = filters.visibility || "public";
      if (activeNav === "public") requestedVisibility = "public";
      if (activeNav === "private") requestedVisibility = "private";
      if (activeNav === "drafts") requestedVisibility = filters.visibility || "all";
      if (activeNav === "uploaded") requestedVisibility = "all";

      const isUploadedView = activeNav === "uploaded";
      const isDraftsView = activeNav === "drafts";
      const isPrivateView = activeNav === "private";
      const isFavoritesView = activeNav === "favorites";

      const mineOnly = isUploadedView || isDraftsView || isPrivateView;
      const excludeDraft = isUploadedView || isPrivateView;
      const status = isDraftsView ? "draft" : undefined;

      if (isFavoritesView) requestedVisibility = "all";

      const res = await axios.get("/api/question-bank/contents", {
        params: {
          includeOwn: true,
          mineOnly,
          excludeDraft,
          favoriteOnly: isFavoritesView,
          visibility: requestedVisibility,
          status,
          content_type: filters.content_type || undefined,
          tag: filters.tag || undefined,
          limit: pagination.limit,
          skip: pagination.skip,
        },
        withCredentials: true,
      });
      const payload = res.data?.data || {};
      const fetched = Array.isArray(payload.items) ? payload.items : [];

      let displayed = fetched;
      if (isUploadedView) {
        displayed = fetched.filter((item) => item?.can_edit && item?.status !== "draft");
      } else if (isDraftsView) {
        displayed = fetched.filter((item) => item?.can_edit && item?.status === "draft");
      } else if (isPrivateView) {
        displayed = fetched.filter((item) => item?.visibility === "private" && item?.status !== "draft");
      } else if (isFavoritesView) {
        displayed = fetched;
      }

      if (activeNav === "favorites") {
        setFavoriteMissingCount(0);
      } else {
        setFavoriteMissingCount(0);
      }

      setItems(displayed);
      setPagination((prev) => {
        const nextPagination = {
          ...prev,
          ...(payload.pagination || {}),
          count: displayed.length,
        };
        if (isFavoritesView) {
          return {
            ...nextPagination,
            skip: 0,
            total: displayed.length,
            count: displayed.length,
            has_more: false,
          };
        }
        return nextPagination;
      });
    } catch (err) {
      setErrorText(err?.response?.data?.error || "加载题库失败");
    } finally {
      setLoading(false);
    }
  }, [activeNav, filters.content_type, filters.tag, filters.visibility, pagination.limit, pagination.skip]);

  const fetchDetail = useCallback(async (id) => {
    setDetailLoading(true);
    try {
      const res = await axios.get(`/api/question-bank/contents/${id}`, { withCredentials: true });
      setSelectedItem(res.data?.data || null);
    } catch (err) {
      setErrorText(err?.response?.data?.error || "加载详情失败");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openDetail = async (id) => {
    if (!id) return;
    if (activeNav === "uploaded" || activeNav === "private" || activeNav === "public") setUploadedDetailModalOpen(true);
    await fetchDetail(id);
  };

  useEffect(() => {
    fetchContents();
  }, [fetchContents]);

  useEffect(() => {
    const prefill = location.state?.prefill;
    if (prefill && typeof prefill === "object") {
      const tags = Array.isArray(prefill.tags) ? prefill.tags : (topic ? [topic] : []);
      setFormData((prev) => ({
        ...prev,
        title: prefill.title || prev.title,
        description: prefill.description || prev.description,
        tagsText: tags.join(", ") || prev.tagsText,
        content_type: prefill.content_type || prev.content_type,
        source: prefill.source || "ai_generated",
        contentText: prefill.contentText || prev.contentText,
        paperItemsText: prefill.paperItemsText || prev.paperItemsText,
      }));
    }

    const quizPaperDraft = location.state?.quizPaperDraft;
    if (quizPaperDraft && typeof quizPaperDraft === "object") {
      const tags = Array.isArray(quizPaperDraft.tags) ? quizPaperDraft.tags : (topic ? [topic] : []);
      const mappedItems = Array.isArray(quizPaperDraft.items)
        ? quizPaperDraft.items.map((item, idx) => makeDraftItem(item, idx))
        : [];
      setDraftMode(true);
      setDraftPaperItems(mappedItems);
      setFormData((prev) => ({
        ...prev,
        title: quizPaperDraft.title || prev.title,
        description: quizPaperDraft.description || prev.description,
        tagsText: tags.join(", ") || prev.tagsText,
        content_type: "paper",
        visibility: quizPaperDraft.visibility || "public",
        source: quizPaperDraft.source || "ai_generated",
        difficulty: prev.difficulty || "medium",
      }));
    }
  }, [location.state, makeDraftItem, topic]);

  const updateDraftItemField = (index, field, value) => {
    if (isDraftModalOpen) setDraftDirty(true);
    setDraftPaperItems((prev) => prev.map((item, idx) => idx === index ? { ...item, [field]: value } : item));
  };

  const updateDraftItemOptionsText = (index, text) => {
    const options = String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    updateDraftItemField(index, "options", options);
  };

  const deleteDraftItem = (index) => {
    if (isDraftModalOpen) setDraftDirty(true);
    setDraftPaperItems((prev) => prev.filter((_, idx) => idx !== index).map((item, idx) => ({ ...item, id: idx + 1 })));
  };

  const onFieldChange = (field, value) => {
    if (isDraftModalOpen) setDraftDirty(true);
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const buildSubmitPayload = useCallback(() => {
    const tags = (formData.tagsText || "")
      .split(/[,，]/)
      .map((v) => v.trim())
      .filter(Boolean);

    if (!formData.title.trim()) {
      return { error: "标题不能为空" };
    }
    if (formData.title.trim().length > 120) {
      return { error: "标题最多 120 个字符" };
    }
    if (tags.length === 0) {
      return { error: "至少需要一个标签" };
    }

    const originalContent = (editingOriginalContent && typeof editingOriginalContent === "object")
      ? editingOriginalContent
      : {};
    const rawInputText = (formData.contentText || "").trim();
    const fallbackText = typeof originalContent.text === "string"
      ? originalContent.text.trim()
      : (typeof originalContent.question === "string" ? originalContent.question.trim() : "");

    const payload = {
      title: formData.title.trim(),
      description: formData.description.trim(),
      tags,
      content_type: formData.content_type,
      visibility: formData.visibility,
      difficulty: formData.difficulty,
      source: formData.source,
      content: {
        ...originalContent,
        text: rawInputText || fallbackText,
        topic,
        week,
        subtopic,
      },
    };

    if (formData.content_type === "paper") {
      if (draftMode) {
        const sanitizedItems = (draftPaperItems || []).map((item, idx) => ({
          id: idx + 1,
          question: String(item?.question || "").trim(),
          type: item?.type || "single_choice",
          options: Array.isArray(item?.options) ? item.options : [],
          answer: item?.answer ?? "",
          explanation: item?.explanation || "",
        })).filter((item) => item.question);

        if (sanitizedItems.length <= 3) {
          return { error: "试卷至少需要 4 道题（删除后不足 4 道时请补充题目）" };
        }
        payload.items = sanitizedItems;
      } else {
        const lines = (formData.paperItemsText || "")
          .split(/\r?\n/)
          .map((v) => v.trim())
          .filter(Boolean);
        payload.items = lines.map((line, idx) => ({ id: idx + 1, question: line }));
        if (payload.items.length <= 3) {
          return { error: "试卷至少需要 4 道题（每行一题）" };
        }
      }
    } else if (!payload.content.text) {
      return { error: "单题模式下，内容不能为空" };
    }

    return { payload };
  }, [draftMode, draftPaperItems, editingOriginalContent, formData, subtopic, topic, week]);

  const confirmDiscardDraftChanges = useCallback(() => {
    if (!isDraftModalOpen || !draftDirty) return true;
    return window.confirm("当前草稿有未保存修改，确认离开吗？");
  }, [draftDirty, isDraftModalOpen]);

  const forceCloseDraftModal = useCallback(() => {
    setIsDraftModalOpen(false);
    setShowUnsavedClosePrompt(false);
    setDraftDirty(false);
    setEditingContentId("");
    setEditingOriginalContent(null);
    setDraftMode(false);
    setDraftPaperItems([]);
  }, []);

  const closeDraftModal = useCallback(() => {
    if (isDraftModalOpen && draftDirty) {
      setShowUnsavedClosePrompt(true);
      return;
    }
    forceCloseDraftModal();
  }, [draftDirty, forceCloseDraftModal, isDraftModalOpen]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorText("");
    setSuccessText("");

    const { payload, error } = buildSubmitPayload();
    if (error) {
      setErrorText(error);
      setSubmitting(false);
      return;
    }

    try {
      if (editingContentId) {
        await axios.patch(`/api/question-bank/contents/${editingContentId}`, payload, { withCredentials: true });
        setSuccessText("草稿已更新。");
      } else {
        await axios.post("/api/question-bank/contents", payload, { withCredentials: true });
        setSuccessText("上传成功，已写入题库框架数据。");
      }
      onFieldChange("title", "");
      onFieldChange("description", "");
      onFieldChange("contentText", "");
      onFieldChange("paperItemsText", "");
      setDraftMode(false);
      setDraftPaperItems([]);
      setEditingContentId("");
      setEditingOriginalContent(null);
      setDraftDirty(false);
      setPagination((prev) => ({ ...prev, skip: 0 }));
      await fetchContents();
    } catch (err) {
      setErrorText(err?.response?.data?.error || "上传失败");
    } finally {
      setSubmitting(false);
    }
  };

  const onVote = async (item, vote) => {
    try {
      const res = await axios.post(`/api/question-bank/contents/${item.id}/vote`, { vote }, { withCredentials: true });
      const stats = res.data?.data || {};
      setItems((prev) => prev.map((row) => row.id === item.id ? {
        ...row,
        my_vote: vote,
        stats: {
          ...(row.stats || {}),
          upvotes: stats.upvotes ?? row?.stats?.upvotes ?? 0,
          downvotes: stats.downvotes ?? row?.stats?.downvotes ?? 0,
        }
      } : row));

      if (selectedItem && selectedItem.id === item.id) {
        setSelectedItem((prev) => ({
          ...prev,
          my_vote: vote,
          stats: {
            ...(prev.stats || {}),
            upvotes: stats.upvotes ?? prev?.stats?.upvotes ?? 0,
            downvotes: stats.downvotes ?? prev?.stats?.downvotes ?? 0,
          }
        }));
      }
    } catch (err) {
      setErrorText(err?.response?.data?.error || "操作失败");
    }
  };

  const onReport = async (item) => {
    try {
      await axios.post(
        `/api/question-bank/contents/${item.id}/report`,
        { reason: reportReason, detail: reportDetail.trim() },
        { withCredentials: true }
      );
      setSuccessText("举报已提交");
      setReportingId("");
      setReportDetail("");
      setItems((prev) => prev.map((row) => row.id === item.id ? { ...row, my_reported: true } : row));
      if (selectedItem && selectedItem.id === item.id) {
        setSelectedItem((prev) => ({ ...prev, my_reported: true }));
      }
    } catch (err) {
      setErrorText(err?.response?.data?.error || "举报失败");
    }
  };

  const toggleFavorite = async (item) => {
    if (!item?.id) return;
    setErrorText("");
    try {
      const nextFavorite = !item.is_favorite;
      await axios.post(`/api/question-bank/contents/${item.id}/favorite`, { favorite: nextFavorite }, { withCredentials: true });

      if (activeNav === "favorites" && !nextFavorite) {
        await fetchContents();
        return;
      }

      setItems((prev) => prev.map((row) => row.id === item.id ? { ...row, is_favorite: nextFavorite } : row));
      if (selectedItem && selectedItem.id === item.id) {
        setSelectedItem((prev) => ({ ...prev, is_favorite: nextFavorite }));
      }
      await fetchContents();
    } catch (err) {
      setErrorText(err?.response?.data?.error || "收藏操作失败");
    }
  };

  const openCancelUploadOptions = (item) => {
    if (!item?.id) return;
    setUploadCancelTarget(item);
    setShowUploadCancelPrompt(true);
  };

  const moveUploadedBackToDraft = async () => {
    const item = uploadCancelTarget;
    if (!item?.id) return;
    setErrorText("");
    setSuccessText("");
    setSubmitting(true);
    try {
      await axios.patch(`/api/question-bank/contents/${item.id}/visibility`, { visibility: "private" }, { withCredentials: true });
      setShowUploadCancelPrompt(false);
      setUploadCancelTarget(null);
      if (item.visibility === "public") {
        setSuccessText("已放回草稿箱并从已上传移除。若其他用户曾收藏该内容，他们将看到该收藏已不可见的提醒。");
      } else {
        setSuccessText("已放回草稿箱并从已上传移除。");
      }
      await fetchContents();
    } catch (err) {
      setErrorText(err?.response?.data?.error || "放回草稿箱失败");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteUploadedContent = async () => {
    const item = uploadCancelTarget;
    if (!item?.id) return;
    setErrorText("");
    setSuccessText("");
    setSubmitting(true);
    try {
      await axios.delete(`/api/question-bank/contents/${item.id}`, { withCredentials: true });
      setShowUploadCancelPrompt(false);
      setUploadCancelTarget(null);
      if (item.visibility === "public") {
        setSuccessText("内容已删除。若其他用户曾收藏该内容，他们将收到收藏已不可见的提醒。");
      } else {
        setSuccessText("内容已删除。");
      }
      await fetchContents();
    } catch (err) {
      setErrorText(err?.response?.data?.error || "删除失败");
    } finally {
      setSubmitting(false);
    }
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
              <p><strong>答案：</strong>{row?.answer || row?.correctAnswer || "-"}</p>
              <p><strong>解析：</strong>{row?.explanation || row?.reason || "-"}</p>
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

  const openDraftEditorById = useCallback(async (draftId) => {
    if (!draftId) return;
    setErrorText("");
    setSuccessText("");
    try {
      const res = await axios.get(`/api/question-bank/contents/${draftId}`, { withCredentials: true });
      const draft = res.data?.data;
      if (!draft) {
        setErrorText("草稿不存在或无法访问");
        return;
      }

      const tags = Array.isArray(draft.tags) ? draft.tags : [];
      const contentType = draft.content_type || "single_question";
      const contentObj = draft.content || {};

      setEditingContentId(draft.id || draftId);
      setEditingOriginalContent(contentObj);
      setDraftMode(contentType === "paper");
      if (contentType === "paper") {
        const mappedItems = Array.isArray(draft.items)
          ? draft.items.map((row, idx) => makeDraftItem(row, idx))
          : [];
        setDraftPaperItems(mappedItems);
      } else {
        setDraftPaperItems([]);
      }

      setFormData((prev) => ({
        ...prev,
        title: draft.title || "",
        description: draft.description || "",
        tagsText: tags.join(", "),
        content_type: contentType,
        visibility: draft.visibility || "private",
        difficulty: draft.difficulty || "medium",
        source: draft.source || "user_original",
        contentText: contentObj.text || contentObj.question || "",
        paperItemsText: contentType === "paper"
          ? (Array.isArray(draft.items) ? draft.items.map((row) => row?.question || "").join("\n") : "")
          : "",
      }));
      setDraftDirty(false);
      setIsDraftModalOpen(true);
    } catch (err) {
      setErrorText(err?.response?.data?.error || "加载草稿失败");
    }
  }, [makeDraftItem]);

  const editDraftItem = async (item) => {
    if (!item?.id) return;
    await openDraftEditorById(item.id);
  };

  const saveDraftFromModal = async ({ closeAfterSave = false } = {}) => {
    if (!editingContentId) {
      setErrorText("缺少草稿ID，无法保存到原草稿");
      return false;
    }
    setSubmitting(true);
    setErrorText("");
    setSuccessText("");
    const { payload, error } = buildSubmitPayload();
    if (error) {
      setErrorText(error);
      setSubmitting(false);
      return;
    }
    try {
      try {
        await axios.patch(`/api/question-bank/contents/${editingContentId}`, payload, { withCredentials: true });
      } catch (firstErr) {
        if (firstErr?.response?.status !== 405) throw firstErr;
        await axios.post("/api/question-bank/contents", {
          ...payload,
          operation: "update_draft",
          content_id: editingContentId,
        }, { withCredentials: true });
      }
      setSuccessText("草稿已保存");
      setDraftDirty(false);
      if (closeAfterSave) {
        forceCloseDraftModal();
      }
      await fetchContents();
      return true;
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.error || err?.message || "未知错误";
      setErrorText(`保存草稿失败（${status || "no-status"}）：${detail}`);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const publishDraftFromModal = async () => {
    if (!editingContentId) return;
    setSubmitting(true);
    setErrorText("");
    setSuccessText("");
    const { payload, error } = buildSubmitPayload();
    if (error) {
      setErrorText(error);
      setSubmitting(false);
      return;
    }
    payload.status = "published";
    try {
      try {
        await axios.patch(`/api/question-bank/contents/${editingContentId}`, payload, { withCredentials: true });
      } catch (firstErr) {
        if (firstErr?.response?.status !== 405) throw firstErr;
        await axios.post("/api/question-bank/contents", {
          ...payload,
          operation: "update_draft",
          content_id: editingContentId,
        }, { withCredentials: true });
      }
      setSuccessText("已正式上传到公共题库");
      setDraftDirty(false);
      forceCloseDraftModal();
      await fetchContents();
    } catch (err) {
      setErrorText(err?.response?.data?.error || "正式上传失败");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteDraftItemPermanently = async (item) => {
    if (!item?.id) return;
    if (!window.confirm("确认从草稿箱删除该内容吗？")) return;
    setErrorText("");
    setSuccessText("");
    try {
      await axios.delete(`/api/question-bank/contents/${item.id}`, { withCredentials: true });
      setSuccessText("草稿已删除");
      if (editingContentId && editingContentId === item.id) forceCloseDraftModal();
      await fetchContents();
    } catch (err) {
      setErrorText(err?.response?.data?.error || "删除草稿失败");
    }
  };

  const publishDraftItem = async (item) => {
    if (!item?.id) return;
    setErrorText("");
    setSuccessText("");
    try {
      await axios.patch(`/api/question-bank/contents/${item.id}/visibility`, { visibility: "public" }, { withCredentials: true });
      setSuccessText("已正式上传到公共题库");
      await fetchContents();
    } catch (err) {
      setErrorText(err?.response?.data?.error || "正式上传失败");
    }
  };

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!isDraftModalOpen || !draftDirty) return;
      e.preventDefault();
      e.returnValue = "当前草稿有未保存修改，确认离开吗？";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [draftDirty, isDraftModalOpen]);

  useEffect(() => {
    const draftIdFromState = location.state?.openDraftId;
    if (!draftIdFromState) return;

    openDraftEditorById(draftIdFromState);
    navigate(location.pathname + location.search, { replace: true, state: {} });
  }, [location.pathname, location.search, location.state, navigate, openDraftEditorById]);

  const toggleVisibility = async (item) => {
    if (!item?.can_edit) return;
    const nextVisibility = item.visibility === "public" ? "private" : "public";
    try {
      await axios.patch(
        `/api/question-bank/contents/${item.id}/visibility`,
        {
          visibility: nextVisibility,
          keep_uploaded: activeNav === "uploaded",
        },
        { withCredentials: true }
      );
      setSuccessText(`已切换为${nextVisibility === "public" ? "公开" : "私有"}`);
      await fetchContents();
      if (selectedItem && selectedItem.id === item.id) {
        await fetchDetail(item.id);
      }
    } catch (err) {
      setErrorText(err?.response?.data?.error || "切换可见性失败");
    }
  };

  const onSearch = () => {
    setPagination((prev) => ({ ...prev, skip: 0 }));
  };

  const onPrevPage = () => {
    setPagination((prev) => ({ ...prev, skip: Math.max(0, prev.skip - prev.limit) }));
  };

  const onNextPage = () => {
    setPagination((prev) => ({ ...prev, skip: prev.skip + prev.limit }));
  };

  const navItems = [
    { key: "notice", label: "消息通知", icon: Bell },
    { key: "drafts", label: "草稿箱", icon: FileBox },
    { key: "uploaded", label: "已上传", icon: Send },
    { key: "private", label: "私人题库", icon: Lock },
    { key: "public", label: "公共题库", icon: BookOpen },
    { key: "favorites", label: "收藏题库", icon: Star },
    { key: "upload", label: "上传文件", icon: CloudUpload },
  ];

  const activeLabel = {
    notice: "消息通知",
    drafts: "草稿箱",
    uploaded: "已上传",
    private: "私人题库",
    public: "公共题库",
    favorites: "收藏题库",
    upload: "上传文件",
  }[activeNav] || "公共题库";

  const shouldShowUploadPanel = activeNav === "upload";
  const shouldShowList = ["public", "private", "uploaded", "drafts", "favorites"].includes(activeNav);

  return (
    <div className="question-bank-page">
      <Header />
      <div className="question-bank-content">
        <div className="qb-layout">
          <aside className="qb-floating-nav">
            <button
              className="qb-avatar-tile"
              onClick={() => {
                if (!confirmDiscardDraftChanges()) return;
                navigate(ROUTES.PROFILE);
              }}
              title="用户中心"
            >
              <img src={userManager.getAvatarUrl() || "/avatar.jpg"} alt="avatar" />
            </button>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  className={`qb-nav-item ${activeNav === item.key ? "active" : ""}`}
                  onClick={() => {
                    if (!confirmDiscardDraftChanges()) return;
                    setActiveNav(item.key);
                    if (item.key === "public") {
                      setFilters((prev) => ({ ...prev, visibility: "public" }));
                    } else if (item.key === "private") {
                      setFilters((prev) => ({ ...prev, visibility: "private" }));
                    } else if (item.key === "drafts" || item.key === "uploaded" || item.key === "favorites") {
                      setFilters((prev) => ({ ...prev, visibility: "all" }));
                    }
                    setPagination((prev) => ({ ...prev, skip: 0 }));
                  }}
                  title={item.label}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </aside>

          <div className="qb-main-panel">
            {activeNav === "notice" ? (
              <section className="panel">
                <h3>通知中心</h3>
                <p className="meta">暂无新消息。后续会在这里展示举报处理、内容审核与系统通知。</p>
              </section>
            ) : null}

            {shouldShowUploadPanel ? (
              <section className="panel">
                <h2 style={{ fontSize: 28, fontWeight: 600, marginBottom: draftMode ? 24 : 32 }}>{draftMode ? "题库草稿箱编辑（确认后上传）" : "上传文件到题库"}</h2>
                {!draftMode && (
                  <div
                    className="upload-dashed-box"
                    style={{
                      border: "2.5px dashed #aaa",
                      borderRadius: 18,
                      padding: 110,
                      margin: "80px auto 40px auto",
                      textAlign: "center",
                      color: "#888",
                      fontSize: 22,
                      background: "#fafbfc",
                      maxWidth: 980,
                      minHeight: 320,
                      cursor: "pointer",
                      position: "relative",
                      boxSizing: "border-box",
                    }}
                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                    onDrop={handleFileDrop}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      style={{ display: "none" }}
                      onChange={handleFileChange}
                    />
                    <div style={{ pointerEvents: "none" }}>
                      <div style={{ fontWeight: 500, fontSize: 22, marginBottom: 8 }}>点击上传文件</div>
                      <div style={{ fontSize: 16 }}>目前只接受 PDF 和 Word 文档（.pdf, .doc, .docx）</div>
                      {uploadingFileName && <div style={{ marginTop: 12, color: '#555' }}>已选择：{uploadingFileName}</div>}
                    </div>
                  </div>
                )}
                <form onSubmit={onSubmit} className="form-grid" style={{ display: draftMode ? undefined : "none" }}>
              <label>
                标题
                <input value={formData.title} onChange={(e) => onFieldChange("title", e.target.value)} required />
              </label>
              <label>
                描述
                <textarea value={formData.description} onChange={(e) => onFieldChange("description", e.target.value)} rows={3} />
              </label>
              <label>
                标签（逗号分隔）
                <input value={formData.tagsText} onChange={(e) => onFieldChange("tagsText", e.target.value)} required />
              </label>
              <label>
                类型
                <select value={formData.content_type} onChange={(e) => onFieldChange("content_type", e.target.value)} disabled={draftMode}>
                  <option value="single_question">单题</option>
                  <option value="paper">试卷</option>
                </select>
              </label>
              <label>
                可见性
                <select value={formData.visibility} onChange={(e) => onFieldChange("visibility", e.target.value)}>
                  <option value="public">公开</option>
                  <option value="private">私有</option>
                </select>
              </label>
              <label>
                来源
                <select value={formData.source} onChange={(e) => onFieldChange("source", e.target.value)}>
                  <option value="user_original">用户原创</option>
                  <option value="ai_generated">AI测验转存</option>
                  <option value="adapted">改编</option>
                </select>
              </label>
              <label>
                难度
                <select value={formData.difficulty} onChange={(e) => onFieldChange("difficulty", e.target.value)}>
                  <option value="easy">easy</option>
                  <option value="medium">medium</option>
                  <option value="hard">hard</option>
                </select>
              </label>
              <label>
                内容（单题文本或说明）
                <textarea value={formData.contentText} onChange={(e) => onFieldChange("contentText", e.target.value)} rows={4} />
              </label>
              {formData.content_type === "paper" && !draftMode ? (
                <label>
                  试卷题目（每行一题，至少4行）
                  <textarea value={formData.paperItemsText} onChange={(e) => onFieldChange("paperItemsText", e.target.value)} rows={6} />
                </label>
              ) : null}

              {formData.content_type === "paper" && draftMode ? (
                <div className="draft-editor-wrap">
                  <p className="meta">默认按“试卷 + 公开”预填。你可以删除题目，或修改题干、答案、解析后再确认上传。</p>
                  {draftPaperItems.map((item, index) => (
                    <article className="draft-item" key={`draft-item-${index}`}>
                      <div className="draft-item-head">
                        <strong>第 {index + 1} 题</strong>
                        <button type="button" onClick={() => deleteDraftItem(index)}>删除该题</button>
                      </div>
                      <label>
                        题目
                        <textarea
                          rows={3}
                          value={item.question}
                          onChange={(e) => updateDraftItemField(index, "question", e.target.value)}
                        />
                      </label>
                      <label>
                        答案
                        <textarea
                          rows={2}
                          value={item.answer}
                          onChange={(e) => updateDraftItemField(index, "answer", e.target.value)}
                        />
                      </label>
                      <label>
                        解析
                        <textarea
                          rows={3}
                          value={item.explanation}
                          onChange={(e) => updateDraftItemField(index, "explanation", e.target.value)}
                        />
                      </label>
                      <label>
                        选项（每行一项，可选）
                        <textarea
                          rows={4}
                          value={(item.options || []).join("\n")}
                          onChange={(e) => updateDraftItemOptionsText(index, e.target.value)}
                        />
                      </label>
                    </article>
                  ))}
                </div>
              ) : null}
                  <button type="submit" disabled={submitting}>{submitting ? "提交中..." : (draftMode ? "确认上传" : "上传")}</button>
                </form>
                {errorText ? <p className="error-text">{errorText}</p> : null}
                {successText ? <p className="success-text">{successText}</p> : null}
              </section>
            ) : null}

            {shouldShowList ? (
              <section className="panel">
                <h2 className={activeNav === "drafts" || activeNav === "uploaded" || activeNav === "private" || activeNav === "favorites" ? "draft-title" : ""}>{activeLabel}列表</h2>
            <div className="filter-row">
              <input
                placeholder="按标签筛选"
                value={filters.tag}
                onChange={(e) => setFilters((prev) => ({ ...prev, tag: e.target.value }))}
              />
              {activeNav !== "public" && activeNav !== "private" ? (
                <select
                  value={filters.visibility}
                  onChange={(e) => setFilters((prev) => ({ ...prev, visibility: e.target.value }))}
                >
                  {(activeNav === "drafts" || activeNav === "uploaded" || activeNav === "favorites") ? (
                    <option value="all">全部可见性</option>
                  ) : null}
                  <option value="public">公开内容</option>
                  <option value="private">私有内容</option>
                </select>
              ) : null}
              <select
                value={filters.content_type}
                onChange={(e) => setFilters((prev) => ({ ...prev, content_type: e.target.value }))}
              >
                <option value="">全部类型</option>
                <option value="single_question">单题</option>
                <option value="paper">试卷</option>
              </select>
              <button onClick={onSearch}>查询</button>
            </div>

            {activeNav === "favorites" && favoriteMissingCount > 0 ? (
              <p className="meta">提醒：有 {favoriteMissingCount} 条收藏内容已不可见（可能已下架或转为私有）。</p>
            ) : null}

            {loading ? (
              <Loader>加载中...</Loader>
            ) : (
              <div className="list-wrap">
                {items.length ? (
                  items.map((item) => (
                    <article className={`bank-item ${activeNav === "drafts" ? "bank-item-draft" : ""} ${activeNav === "uploaded" ? "bank-item-uploaded" : ""} ${activeNav === "private" ? "bank-item-private" : ""} ${activeNav === "public" ? "bank-item-public" : ""} ${activeNav === "favorites" ? "bank-item-favorites" : ""}`} key={item.id}>
                      <h3>{item.title}</h3>
                      <p className="meta">{item.content_type} | {item.visibility} | {item.status}</p>
                      <p>{item.description || "暂无描述"}</p>
                      <p className="meta">标签: {(item.tags || []).join(", ") || "-"}</p>
                      {activeNav !== "drafts" && activeNav !== "private" ? (
                        <p className="meta">赞 {item?.stats?.upvotes || 0} / 踩 {item?.stats?.downvotes || 0}</p>
                      ) : null}
                      {activeNav === "public" ? (
                        <>
                          <div className="item-actions public-left-actions">
                            <button
                              className={item.my_vote === "upvote" ? "active" : ""}
                              onClick={() => onVote(item, item.my_vote === "upvote" ? "none" : "upvote")}
                            >
                              {item.my_vote === "upvote" ? "取消赞" : "赞"}
                            </button>
                            <button
                              className={item.my_vote === "downvote" ? "active" : ""}
                              onClick={() => onVote(item, item.my_vote === "downvote" ? "none" : "downvote")}
                            >
                              {item.my_vote === "downvote" ? "取消踩" : "踩"}
                            </button>
                          </div>
                          <div className="item-actions public-right-actions">
                            <button onClick={() => openDetail(item.id)}>查看详情</button>
                            <button onClick={() => toggleFavorite(item)}>
                              {item.is_favorite ? "取消收藏" : "收藏"}
                            </button>
                            <button onClick={() => openPracticeModal(item)}>测试</button>
                            {item.my_reported ? (
                              <span className="reported-badge">已举报</span>
                            ) : (
                              <button onClick={() => setReportingId(item.id)}>举报</button>
                            )}
                          </div>
                        </>
                      ) : activeNav === "favorites" ? (
                        <>
                          <div className="item-actions favorites-left-actions">
                            <button
                              className={item.my_vote === "upvote" ? "active" : ""}
                              onClick={() => onVote(item, item.my_vote === "upvote" ? "none" : "upvote")}
                            >
                              {item.my_vote === "upvote" ? "取消赞" : "赞"}
                            </button>
                            <button
                              className={item.my_vote === "downvote" ? "active" : ""}
                              onClick={() => onVote(item, item.my_vote === "downvote" ? "none" : "downvote")}
                            >
                              {item.my_vote === "downvote" ? "取消踩" : "踩"}
                            </button>
                          </div>
                          <div className="item-actions favorites-right-actions">
                            <button onClick={() => {
                              setSelectedItem(item);
                              setUploadedDetailModalOpen(true);
                            }}>查看详情</button>
                            <button onClick={() => openPracticeModal(item)}>测试</button>
                            <button onClick={() => toggleFavorite(item)}>
                              {item.is_favorite ? "取消收藏" : "收藏"}
                            </button>
                            {item.my_reported ? (
                              <span className="reported-badge">已举报</span>
                            ) : (
                              <button onClick={() => setReportingId(item.id)}>举报</button>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className={`item-actions ${activeNav === "drafts" ? "draft-item-actions" : ""} ${activeNav === "uploaded" ? "uploaded-item-actions" : ""} ${activeNav === "private" ? "private-item-actions" : ""}`}>
                          {activeNav === "drafts" && item.can_edit ? (
                            <button onClick={() => editDraftItem(item)}>编辑草稿</button>
                          ) : null}
                          {activeNav === "drafts" && item.can_edit ? (
                            <button onClick={() => publishDraftItem(item)}>正式上传</button>
                          ) : null}
                          {activeNav === "drafts" && item.can_edit ? (
                            <button onClick={() => deleteDraftItemPermanently(item)}>删除草稿</button>
                          ) : null}
                          {activeNav !== "drafts" ? (
                            <>
                              <button onClick={() => openDetail(item.id)}>查看详情</button>
                              <button onClick={() => toggleFavorite(item)}>
                                {item.is_favorite ? "取消收藏" : "收藏"}
                              </button>
                              {(activeNav === "public" || activeNav === "private") ? (
                                <button onClick={() => openPracticeModal(item)}>测试</button>
                              ) : null}
                              {activeNav !== "uploaded" && activeNav !== "private" ? (
                                <>
                                  <button
                                    className={item.my_vote === "upvote" ? "active" : ""}
                                    onClick={() => onVote(item, item.my_vote === "upvote" ? "none" : "upvote")}
                                  >
                                    {item.my_vote === "upvote" ? "取消赞" : "赞"}
                                  </button>
                                  <button
                                    className={item.my_vote === "downvote" ? "active" : ""}
                                    onClick={() => onVote(item, item.my_vote === "downvote" ? "none" : "downvote")}
                                  >
                                    {item.my_vote === "downvote" ? "取消踩" : "踩"}
                                  </button>
                                </>
                              ) : null}
                              {item.can_edit && (activeNav === "uploaded" || activeNav === "private") ? (
                                <button onClick={() => toggleVisibility(item)}>
                                  切换为{item.visibility === "public" ? "私有" : "公有"}
                                </button>
                              ) : null}
                              {activeNav === "uploaded" && item.can_edit ? (
                                <button onClick={() => openCancelUploadOptions(item)}>取消上传</button>
                              ) : null}
                              {activeNav !== "uploaded" && activeNav !== "private" ? (
                                item.my_reported ? (
                                  <span className="reported-badge">已举报</span>
                                ) : (
                                  <button onClick={() => setReportingId(item.id)}>举报</button>
                                )
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      )}
                      {activeNav !== "drafts" && activeNav !== "private" && reportingId === item.id ? (
                        <div className="report-box">
                          <select value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
                            <option value="错误答案">错误答案</option>
                            <option value="违规内容">违规内容</option>
                            <option value="抄袭">抄袭</option>
                            <option value="广告或无关">广告或无关</option>
                          </select>
                          <input
                            placeholder="补充说明（可选）"
                            value={reportDetail}
                            onChange={(e) => setReportDetail(e.target.value)}
                          />
                          <button onClick={() => onReport(item)}>提交举报</button>
                          <button onClick={() => setReportingId("")}>取消</button>
                        </div>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p className="meta">暂无内容</p>
                )}
              </div>
            )}

            <div className="pager-row">
              {activeNav !== "public" ? (
                <span className="meta">共 {pagination.total || 0} 条，当前 {Math.floor((pagination.skip || 0) / (pagination.limit || 1)) + 1} 页</span>
              ) : <span />}
              <div>
                <button onClick={onPrevPage} disabled={(pagination.skip || 0) <= 0 || activeNav === "favorites"}>上一页</button>
                <button onClick={onNextPage} disabled={!pagination.has_more || activeNav === "favorites"}>下一页</button>
              </div>
            </div>
              </section>
            ) : null}

            {/* 收藏tab详情面板已移除，详情统一用弹窗展示 */}

            {!selectedItem && detailLoading ? <Loader>详情加载中...</Loader> : null}
          </div>
        </div>
      </div>

      <Modal open={uploadedDetailModalOpen} onClose={() => setUploadedDetailModalOpen(false)}>
        <div className="draft-modal-wrap">
          <h2>内容详情</h2>
          {detailLoading ? (
            <Loader>详情加载中...</Loader>
          ) : selectedItem ? (
            <div className="detail-wrap">
              <h3>{selectedItem.title}</h3>
              <p className="meta">{selectedItem.content_type} | {selectedItem.visibility} | {selectedItem.status}</p>
              <p>{selectedItem.description || "暂无描述"}</p>
              <p className="meta">标签: {(selectedItem.tags || []).join(", ") || "-"}</p>
              {renderVisualContentDetail(selectedItem)}
            </div>
          ) : (
            <p className="meta">暂无详情</p>
          )}
        </div>
      </Modal>

      <Modal open={quizModalOpen} onClose={closeQuizModal}>
        <div className="draft-modal-wrap">
          <h2>题库测试</h2>
          <p className="meta">{quizTitle || "题目练习"}</p>

          {quizLoading ? (
            <Loader>测试题加载中...</Loader>
          ) : !currentQuizQuestion ? (
            <p className="meta">暂无可测试题目</p>
          ) : (
            <div className="qb-practice-wrap">
              <p className="meta">第 {quizIndex + 1} / {quizQuestions.length} 题</p>
              <h3 className="qb-practice-question">{currentQuizQuestion.question}</h3>

              {currentQuizQuestion.options.length ? (
                <div className="qb-practice-options">
                  {currentQuizQuestion.options.map((opt, idx) => {
                    const selected = currentQuizSelections.includes(idx);
                    const correct = currentQuizQuestion.answerIndices.includes(idx);
                    const isSubmitted = currentQuizSubmitted;
                    let cls = "";
                    if (isSubmitted && selected && correct) cls = "correct";
                    if (isSubmitted && selected && !correct) cls = "wrong";
                    if (isSubmitted && !selected && correct) cls = "missed";
                    return (
                      <button
                        key={`practice-opt-${currentQuizQuestion.id}-${idx}`}
                        type="button"
                        className={`qb-practice-option ${selected ? "selected" : ""} ${cls}`}
                        onClick={() => selectQuizOption(idx)}
                        disabled={isSubmitted}
                      >
                        <span>{String.fromCharCode(65 + idx)}.</span> {opt}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="qb-practice-answer">
                  <p>标准答案：</p>
                  <pre className="content-preview">{String(currentQuizQuestion.answerText || "-")}</pre>
                </div>
              )}

              {currentQuizSubmitted ? (
                <div className="qb-practice-answer">
                  <p>标准答案：{currentQuizQuestion.answerText ? String(currentQuizQuestion.answerText) : "-"}</p>
                  <p>解析：{currentQuizQuestion.explanation || "-"}</p>
                </div>
              ) : null}

              <div className="draft-modal-actions">
                <button type="button" onClick={() => setQuizIndex((idx) => Math.max(0, idx - 1))} disabled={quizIndex === 0}>上一题</button>
                <button type="button" onClick={submitCurrentQuizQuestion} disabled={currentQuizSubmitted || !currentQuizQuestion.options.length || !currentQuizSelections.length}>提交答案</button>
                <button type="button" onClick={() => setQuizIndex((idx) => Math.min(quizQuestions.length - 1, idx + 1))} disabled={quizIndex >= quizQuestions.length - 1}>下一题</button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal open={showUploadCancelPrompt} onClose={() => setShowUploadCancelPrompt(false)} simple noBlur>
        <div className="confirm-box">
          <h2>取消上传</h2>
          <p>请选择对该内容的处理方式。</p>
          <div className="confirm-actions">
            <button className="confirm-yes" onClick={moveUploadedBackToDraft} disabled={submitting}>放回草稿箱</button>
            <button className="confirm-no" onClick={deleteUploadedContent} disabled={submitting}>删除</button>
            <button className="confirm-no" onClick={() => setShowUploadCancelPrompt(false)} disabled={submitting}>取消</button>
          </div>
        </div>
      </Modal>

      <Modal open={isDraftModalOpen} onClose={closeDraftModal}>
        <div className="draft-modal-wrap">
          <h2>编辑草稿</h2>
          <p className="meta">仅显示当前草稿内容。可关闭、保存、删除或正式上传。</p>
          <div className="draft-modal-form form-grid">
            <label>
              标题
              <input value={formData.title} onChange={(e) => onFieldChange("title", e.target.value)} required />
            </label>
            <label>
              描述
              <textarea value={formData.description} onChange={(e) => onFieldChange("description", e.target.value)} rows={3} />
            </label>
            <label>
              标签（逗号分隔）
              <input value={formData.tagsText} onChange={(e) => onFieldChange("tagsText", e.target.value)} required />
            </label>
            <label>
              类型
              <select value={formData.content_type} onChange={(e) => onFieldChange("content_type", e.target.value)} disabled={draftMode}>
                <option value="single_question">单题</option>
                <option value="paper">试卷</option>
              </select>
            </label>
            <label>
              可见性
              <select value={formData.visibility} onChange={(e) => onFieldChange("visibility", e.target.value)}>
                <option value="public">公开</option>
                <option value="private">私有</option>
              </select>
            </label>
            <label>
              来源
              <select value={formData.source} onChange={(e) => onFieldChange("source", e.target.value)}>
                <option value="user_original">用户原创</option>
                <option value="ai_generated">AI测验转存</option>
                <option value="adapted">改编</option>
              </select>
            </label>
            <label>
              难度
              <select value={formData.difficulty} onChange={(e) => onFieldChange("difficulty", e.target.value)}>
                <option value="easy">easy</option>
                <option value="medium">medium</option>
                <option value="hard">hard</option>
              </select>
            </label>
            <label>
              内容（单题文本或说明）
              <textarea value={formData.contentText} onChange={(e) => onFieldChange("contentText", e.target.value)} rows={4} />
            </label>

            {formData.content_type === "paper" && !draftMode ? (
              <label>
                试卷题目（每行一题，至少4行）
                <textarea value={formData.paperItemsText} onChange={(e) => onFieldChange("paperItemsText", e.target.value)} rows={6} />
              </label>
            ) : null}

            {formData.content_type === "paper" && draftMode ? (
              <div className="draft-editor-wrap">
                {(draftPaperItems || []).map((item, index) => (
                  <article className="draft-item" key={`modal-draft-item-${index}`}>
                    <div className="draft-item-head">
                      <strong>第 {index + 1} 题</strong>
                      <button type="button" onClick={() => deleteDraftItem(index)}>删除该题</button>
                    </div>
                    <label>
                      题目
                      <textarea rows={3} value={item.question} onChange={(e) => updateDraftItemField(index, "question", e.target.value)} />
                    </label>
                    <label>
                      答案
                      <textarea rows={2} value={item.answer} onChange={(e) => updateDraftItemField(index, "answer", e.target.value)} />
                    </label>
                    <label>
                      解析
                      <textarea rows={3} value={item.explanation} onChange={(e) => updateDraftItemField(index, "explanation", e.target.value)} />
                    </label>
                    <label>
                      选项（每行一项，可选）
                      <textarea rows={4} value={(item.options || []).join("\n")} onChange={(e) => updateDraftItemOptionsText(index, e.target.value)} />
                    </label>
                  </article>
                ))}
              </div>
            ) : null}
          </div>

          <div className="draft-modal-actions">
            <button type="button" onClick={saveDraftFromModal} disabled={submitting}>{submitting ? "处理中..." : "保存"}</button>
            <button
              type="button"
              onClick={() => deleteDraftItemPermanently({ id: editingContentId })}
              disabled={submitting}
            >
              删除
            </button>
            <button type="button" onClick={publishDraftFromModal} disabled={submitting}>{submitting ? "处理中..." : "上传"}</button>
          </div>
          {errorText ? <p className="error-text">{errorText}</p> : null}
          {successText ? <p className="success-text">{successText}</p> : null}
        </div>
      </Modal>

      <Modal open={showUnsavedClosePrompt} onClose={() => setShowUnsavedClosePrompt(false)} simple noBlur>
        <div className="confirm-box">
          <h2>是否保存对草稿的修改？</h2>
          <p>你当前有未保存修改，选择后再继续。</p>
          <div className="confirm-actions">
            <button
              className="confirm-yes"
              onClick={async () => {
                setShowUnsavedClosePrompt(false);
                await saveDraftFromModal({ closeAfterSave: true });
              }}
              disabled={submitting}
            >
              保存
            </button>
            <button
              className="confirm-no"
              onClick={() => {
                forceCloseDraftModal();
              }}
              disabled={submitting}
            >
              不保存
            </button>
            <button
              className="confirm-no"
              onClick={() => setShowUnsavedClosePrompt(false)}
              disabled={submitting}
            >
              取消
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default QuestionBankPage;
