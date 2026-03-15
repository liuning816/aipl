
import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { ROUTES } from '../../routes';
import "./topic.css";
import Header from "../../components/header/header";
import { ArrowRight, LibraryBig, Search } from "lucide-react";
import Loader from "../../components/loader/loader";
import userManager from '../../utils/userManager';

// 上传区组件：大虚线框，中央可点击文字，支持拖拽和点击上传 PDF/Word 文件
const FileUploadArea = ({ onFileUploaded }) => {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);
  const [error, setError] = useState("");

  // 仅允许 PDF 和 Word
  const allowedTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword"
  ];

  const handleFiles = (files) => {
    const file = files[0];
    if (!file) return;
    if (!allowedTypes.includes(file.type)) {
      setError("仅支持上传 PDF 或 Word 文档");
      return;
    }
    setError("");
    onFileUploaded(file);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  return (
    <div
      className={`upload-area-large${dragActive ? " drag-active" : ""}`}
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      style={{
        border: "3px dashed #aaa",
        borderRadius: "18px",
        padding: "5em 0",
        textAlign: "center",
        background: dragActive ? "#f0f0f0" : "#fff",
        margin: "2em auto 2em auto",
        width: "min(600px, 90vw)",
        cursor: "pointer",
        position: "relative"
      }}
      onClick={() => inputRef.current && inputRef.current.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{ display: "none" }}
        onChange={handleChange}
      />
      <div style={{
        fontSize: "1.5em",
        color: dragActive ? "#333" : "#666",
        fontWeight: 500,
        userSelect: "none"
      }}>
        点击上传文件（目前只接受pdf和word）
      </div>
      {error && <div style={{ color: "red", marginTop: "1em" }}>{error}</div>}
    </div>
  );
};

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";
axios.defaults.baseURL = API_BASE;
userManager.applyAuthHeader(axios);

const TopicPage = (props) => {
  const suggestionList = [
    "竞争性编程",
    "机器学习",
    "量化金属",
    "网络开发",
    "量子科技",
  ];
  const colors = [
    "#D14EC4",
    "#AFD14E",
    "#4ED1B1",
    "#D14E4E",
    "#D1854E",
    "#904ED1",
    "#4EAAD1",
  ];
  const [topic, setTopic] = useState("");
  const [timeInput, setTimeInput] = useState(4);
  const [timeUnit, setTimeUnit] = useState("Weeks");
  const [time, setTime] = useState("4 Weeks");
  const [knowledgeLevel, setKnowledgeLevel] = useState("Absolute Beginner");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (topic) {
      console.log("Topic: ", topic);
    }
  }, [topic]);

  // 如果从其它页面跳转并带有 query params, 支持预填 topic 和 regenerate
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const qTopic = searchParams.get('topic');
    if (!qTopic) return;

    setTopic(qTopic);
    // 如果本地有已有设置，优先用本地值作为默认 time/knowledge
    const topics = JSON.parse(localStorage.getItem('topics')) || {};
    if (!topics[qTopic]) return;

    const savedTime = topics[qTopic].time || '4 周';
    const parsedTime = parseInt(savedTime.split(' ')[0], 10);
    const parsedUnit = savedTime.split(' ')[1];

    setTimeInput((prev) => (Number.isFinite(parsedTime) ? parsedTime : prev));
    setTimeUnit((prev) => parsedUnit || prev);
    setKnowledgeLevel((prev) => topics[qTopic].knowledge_level || prev);
  }, [searchParams]);

  useEffect(() => {
    setTime(timeInput + " " + timeUnit);
  }, [timeInput, timeUnit]);

  const Suggestions = ({ list }) => {
    return (
      <div className="flexbox suggestions">
        {list.map((item, i) => (
          <button>
            <div
              className="suggestionPill"
              onClick={() => {
                setTopic(item);
              }}
              style={{ "--clr": colors[i % colors.length] }}
            >
              {item} <ArrowRight className="arrow" size={30} strokeWidth={1} />
            </div>
          </button>
        ))}
      </div>
    );
  };

  const TopicInput = () => {
    const [inputVal, setInputVal] = useState("");
    const searchIcon = <Search size={65} color={"white"} strokeWidth={2} />;
    const arrowIcon = <ArrowRight size={65} color={"white"} strokeWidth={2} />;
    const [icon, setIcon] = useState(searchIcon);

    return (
      <div className="inputContainer TopicInput">
        <LibraryBig
          className="icon"
          size={78}
          color={"#73737D"}
          strokeWidth={1}
        />
        <input
          type="text"
          placeholder="输入一个主题"
          value={inputVal}
          onChange={(e) => {
            setInputVal(e.target.value);
            if (e.target.value) {
              setIcon(arrowIcon);
            } else {
              setIcon(searchIcon);
            }
          }}
        />
        <button
          onClick={(e) => {
            e.preventDefault();
            if (inputVal) {
              setTopic(inputVal);
            }
          }}
        >
          {icon}
        </button>
      </div>
    );
  };
  const SetTopic = () => {
    return (
      <div className="flexbox main setTopic">
        <h2>你想要学习什么?</h2>
        <TopicInput />
        <h3>建议:</h3>
        <Suggestions list={suggestionList}></Suggestions>
      </div>
    );
  };

  const TimeInput = () => {
    return (
      <div className="flexbox TimeInput">
        <div className="inputContainer">
          <input
            id="timeInput"
            type="number"
            value={timeInput}
            onChange={(e) => {
              if (e.target.value > 100 || e.target.value < 0) {
                return;
              }
              setTimeInput(e.target.value);
            }}
          />
        </div>
        <div className="inputContainer">
          <select
            name="timeUnit"
            id="timeUnit"
            value={timeUnit}
            onChange={(e) => {
              setTimeUnit(e.target.value);
            }}
          >
            {/* <option value="Days" id="Days">
              Days
            </option>
            <option value="Hours" id="Hours">
              Hours
            </option> */}
            <option value="周" id="周">
              周
            </option>
            <option value="月" id="月">
              月
            </option>
          </select>
        </div>
      </div>
    );
  };
  const KnowledgeLevelInput = () => {
    return (
      <div className="inputContainer">
        <select
          name="knowledgeLevel"
          id="knowledgeLevel"
          style={{ width: "min-content", textAlign: "center" }}
          value={knowledgeLevel}
          onChange={(e) => {
            setKnowledgeLevel(e.target.value);
          }}
        >
          <option value="完全初学者">完全初学者</option>
          <option value="初学者">初学者</option>
          <option value="中级学者">中级学者</option>
          <option value="专家">专家</option>
        </select>
      </div>
    );
  };
  const SubmitButton = ({ children }) => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const forceRegenerate = searchParams.get('regenerate') === 'true';

    return (
      <button
        className="SubmitButton"
        onClick={async () => {
          if (time === "0 Weeks" || time === "0 Months") {
            alert("请输入有效的时间段");
            return;
          }
          setLoading(true);

          // check if topic is already present on localstorage
          let topics = JSON.parse(localStorage.getItem("topics")) || {};
          const shouldCallApi = forceRegenerate || !Object.keys(topics).includes(topic);

          if (shouldCallApi) {
            const data = { topic, time, knowledge_level: knowledgeLevel };
            try {
              axios.defaults.baseURL = API_BASE;
              userManager.applyAuthHeader(axios);

              // 如果是强制重新生成（来自路线页面的更改选择），先删除原有课程数据
              if (forceRegenerate) {
                try {
                  const delRes = await axios({
                    method: 'POST',
                    url: '/api/cancel-course',
                    data: { course: topic },
                    withCredentials: true,
                  });

                  if (!(delRes.data && delRes.data.success)) {
                    alert('删除原有路径失败，已停止生成');
                    setLoading(false);
                    return;
                  }

                  // 本地清理
                  try {
                    const roadmaps = JSON.parse(localStorage.getItem('roadmaps')) || {};
                    delete roadmaps[topic];
                    localStorage.setItem('roadmaps', JSON.stringify(roadmaps));

                    const topicsLs = JSON.parse(localStorage.getItem('topics')) || {};
                    delete topicsLs[topic];
                    localStorage.setItem('topics', JSON.stringify(topicsLs));

                    const stats = JSON.parse(localStorage.getItem('quizStats')) || {};
                    delete stats[topic];
                    localStorage.setItem('quizStats', JSON.stringify(stats));
                  } catch (e) {
                    console.warn('清理 localStorage 时出错', e);
                  }
                } catch (err) {
                  console.error('取消原课程失败', err);
                  alert('取消原有课程失败，已停止生成');
                  setLoading(false);
                  return;
                }
              }

              const res = await axios({
                method: "POST",
                url: "/api/roadmap",
                data: data,
                withCredentials: true,
              });

              topics[topic] = { time, knowledge_level: knowledgeLevel };
              localStorage.setItem("topics", JSON.stringify(topics));

              let roadmaps = JSON.parse(localStorage.getItem("roadmaps")) || {};
              roadmaps[topic] = res.data;
              localStorage.setItem("roadmaps", JSON.stringify(roadmaps));

              navigate(ROUTES.ROADMAP + '?topic=' + encodeURI(topic));
            } catch (error) {
              console.log(error);
              if (error?.response?.status === 401) {
                alert("登录状态已失效，请重新登录后再试。");
                navigate(ROUTES.LOGIN);
              } else if (error?.response?.status === 429) {
                alert("操作过于频繁，请稍后再试。");
              } else {
                alert("生成学习路线图时出错，请稍后重试。");
              }
              navigate(ROUTES.HOME);
            } finally {
              setLoading(false);
            }
          } else {
            setLoading(false);
            // 如果不需要调用 API（非强制重新生成，且已有数据），直接跳转到现有路线图
              navigate(ROUTES.ROADMAP + '?topic=' + encodeURI(topic));
          }
        }}
      >
        {children}
      </button>
    );
  };
  const SetDetails = () => {
    return (
      <div className="flexbox main setDetails">
        <h2>你有多少时间来学习它?</h2>
        <TimeInput />
        <h2 style={{ marginTop: "1.5em" }}>
          你在该学科上的知识水平
        </h2>
        <KnowledgeLevelInput />
        <SubmitButton>开始学习</SubmitButton>
      </div>
    );
  };


  // 上传文件后回调，调用后端接口并显示编辑区
  const [parsedQuestions, setParsedQuestions] = useState(null);
  const [editQuestions, setEditQuestions] = useState([]);
  const [editTags, setEditTags] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [draftId, setDraftId] = useState(null);

  // 上传文件后自动解析并保存为草稿，成功后跳转到草稿箱编辑页
  const navigate = useNavigate();
  const handleFileUploaded = async (file) => {
    setLoading(true);
    setParsedQuestions(null);
    setEditQuestions([]);
    setEditTags("");
    setEditDesc("");
    setDraftId(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.post("/api/upload-questions", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        withCredentials: true,
      });
      if (res.data && res.data.success) {
        // 自动保存为草稿
        const saveRes = await axios.post("/api/question-bank/contents", {
          content_type: "paper",
          visibility: "private",
          title: file.name.replace(/\.[^.]+$/, ""),
          tags: [],
          description: "",
          items: res.data.questions.map(q => ({ text: q.content || "" })),
        }, { withCredentials: true });
        if (saveRes.data && saveRes.data.success && saveRes.data.data && saveRes.data.data._id) {
          // 跳转到草稿箱编辑页
          navigate(`/questionbank/draft/${saveRes.data.data._id}`);
        } else {
          alert("自动保存草稿失败");
        }
      } else {
        alert("文件解析失败");
      }
    } catch (e) {
      alert("上传或解析失败");
    } finally {
      setLoading(false);
    }
  };


  // 题目编辑区
  // 保存/发布按钮逻辑
  const handleSaveDraft = async () => {
    if (!draftId) return alert("未找到草稿ID");
    setLoading(true);
    try {
      const res = await axios.post("/api/question-bank/contents", {
        operation: "update_draft",
        content_id: draftId,
        content_type: "paper",
        visibility: "private",
        title: parsedQuestions && parsedQuestions.length > 0 ? `上传题库-${parsedQuestions.length}题` : "上传题库",
        tags: editTags.split(",").map(t => t.trim()).filter(Boolean),
        description: editDesc,
        items: editQuestions.map(q => ({ text: q })),
      }, { withCredentials: true });
      if (res.data && res.data.success) {
        alert("已保存到草稿箱");
      } else {
        alert("保存草稿失败");
      }
    } catch (e) {
      alert("保存草稿失败");
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!draftId) return alert("未找到草稿ID");
    setLoading(true);
    try {
      const res = await axios.post("/api/question-bank/contents", {
        operation: "update_draft",
        content_id: draftId,
        content_type: "paper",
        visibility: "public",
        title: parsedQuestions && parsedQuestions.length > 0 ? `上传题库-${parsedQuestions.length}题` : "上传题库",
        tags: editTags.split(",").map(t => t.trim()).filter(Boolean),
        description: editDesc,
        items: editQuestions.map(q => ({ text: q })),
      }, { withCredentials: true });
      if (res.data && res.data.success) {
        alert("已发布题库");
      } else {
        alert("发布失败");
      }
    } catch (e) {
      alert("发布失败");
    } finally {
      setLoading(false);
    }
  };

  const renderEditArea = () => (
    <div className="edit-area">
      <h2>编辑识别出的题目</h2>
      <div style={{marginBottom: "1em"}}>
        <label>标签（可选，逗号分隔）：</label>
        <input style={{width: "60%"}} value={editTags} onChange={e => setEditTags(e.target.value)} placeholder="如：选择题,数学" />
      </div>
      <div style={{marginBottom: "1em"}}>
        <label>描述（可选）：</label>
        <input style={{width: "60%"}} value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="本次上传的题目说明..." />
      </div>
      <div>
        {editQuestions.map((q, idx) => (
          <div key={idx} style={{marginBottom: "1em", borderBottom: "1px solid #eee", paddingBottom: "0.5em"}}>
            <span style={{color: "#888"}}>题目{idx+1}：</span>
            <textarea style={{width: "90%", minHeight: "48px"}}
              value={q}
              onChange={e => {
                const arr = [...editQuestions];
                arr[idx] = e.target.value;
                setEditQuestions(arr);
              }}
            />
          </div>
        ))}
      </div>
      <div style={{marginTop: "1.5em"}}>
        <button style={{marginRight: "1em"}} onClick={handleSaveDraft}>保存到草稿箱</button>
        <button onClick={handlePublish}>直接发布</button>
      </div>
    </div>
  );

  return (
    <div className="wrapper">
      <Loader style={{ display: loading ? "block" : "none" }}>
        {loading ? "正在上传/解析文件..." : ""}
      </Loader>
      <Header></Header>
      {/* 上传区放在页面顶部 */}
      <FileUploadArea onFileUploaded={handleFileUploaded} />
      {parsedQuestions ? renderEditArea() : (!topic ? <SetTopic /> : <SetDetails />)}
    </div>
  );
};

export default TopicPage;
