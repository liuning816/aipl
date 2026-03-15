import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import "./roadmap.css";
import Header from "../../components/header/header";
import Loader from "../../components/loader/loader";
import Modal from "../../components/modal/modal";
import {
  ChevronRight,
  FolderSearch,
  Bot,
} from "lucide-react";
import Markdown from "react-markdown";
import ConfettiExplosion from "react-confetti-explosion";
import userManager from '../../utils/userManager';
import { ROUTES } from '../../routes';

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";
axios.defaults.baseURL = API_BASE;
userManager.applyAuthHeader(axios);

const RoadmapPage = (props) => {
  const [resources, setResources] = useState(null);
  const [resourceParam, setResourceParam] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const [roadmap, setRoadmap] = useState({});
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateResource, setRegenerateResource] = useState(false);
  const [resourceMode, setResourceMode] = useState("ai");
  const [videoKeywordInput, setVideoKeywordInput] = useState("");
  const [videoSearchPage, setVideoSearchPage] = useState(1);
  const [canceling, setCanceling] = useState(false);
  const [topicDetails, setTopicDetails] = useState({
    time: "-",
    knowledge_level: "-",
  });
  const [quizStats, setQuizStats] = useState({});
  const [confettiExplode, setConfettiExplode] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmOptions, setConfirmOptions] = useState({});
  const videoResultCacheRef = useRef({});
  const navigate = useNavigate();
  const topic = searchParams.get("topic");
  if (!topic) {
    navigate(ROUTES.HOME);
  }
  useEffect(() => {
    const topics = JSON.parse(localStorage.getItem("topics")) || {};

    setTopicDetails(topics[topic]);

    const roadmaps = JSON.parse(localStorage.getItem("roadmaps")) || {};
    setRoadmap(roadmaps[topic]);
    // setLoading(true);
    // translateObj(roadmaps[topic], "hi").then((translatedObj) => {
    // setRoadmap(translatedObj);
    // setLoading(false);
    //   console.log(translatedObj);
    // });

    const stats = JSON.parse(localStorage.getItem("quizStats")) || {};
    setQuizStats(stats[topic] || {});

    if (
      !Object.keys(roadmaps).includes(topic) ||
      !Object.keys(topics).includes(topic)
    ) {
      //   alert(`Roadmap for ${topic} not found. Please generate it first.`);
      navigate("/");
    }
  }, [topic, navigate]);

  const colors = [
    "#D14EC4",
    "#4ED1B1",
    "#D14E4E",
    "#4EAAD1",
    "#D1854E",
    "#904ED1",
    "#AFD14E",
  ];

  const Subtopic = ({ subtopic, number, style, weekNum, weekTitle, weekTopic, quizStats }) => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const topic = searchParams.get("topic");
    const rawStats = quizStats || {};
    const aiStats = rawStats.ai || ((rawStats.completedAt || rawStats.timeTaken) ? rawStats : {});
    const bankStats = rawStats.bank || {};
    const aiTaken = !!(aiStats.completedAt || aiStats.timeTaken);
    const bankTaken = !!(bankStats.completedAt || bankStats.timeTaken);
    const aiScore = aiStats.scorePercent;
    const bankScore = bankStats.scorePercent;

    return (
      <div
        className="flexbox subtopic"
        style={{ ...style, justifyContent: "space-between" }}
      >
        <h1 className="number">{number}</h1>
        <div className="detail">
          <h3
            style={{
              fontWeight: "600",
              textTransform: "capitalize",
            }}
          >
            {subtopic.subtopic}
          </h3>
          <p className="time">
            {parseFloat(subtopic.time.replace(/^\D+/g, "")).toFixed(1)}{' '}
            {subtopic.time.replace(/[0-9]/g, "")}
          </p>
          <p style={{ fontWeight: "300", opacity: "61%", marginTop: "1em" }}>
            {subtopic.description}
          </p>
        </div>
        <div className="flexbox buttons" style={{ flexDirection: "column" }}>
          <button
            className="resourcesButton"
            onClick={() => {
              setModalOpen(true);
              setResourceParam({
                subtopic: subtopic.subtopic,
                description: subtopic.description,
                time: subtopic.time,
                course: topic,
                week_title: weekTitle,
                week_topic: weekTopic,
                knowledge_level: topicDetails.knowledge_level,
              });
            }}
          >
            学习资源
          </button>
          <div className="quiz-action-row">
            <div className="quiz-score-slot">
              {bankTaken && bankScore !== undefined && bankScore !== null ? <div className="quiz-score">{`${bankScore}%`}</div> : null}
            </div>
            <button
              className="quizButton"
              onClick={() => {
                navigate(`${ROUTES.QUIZ}?topic=${encodeURIComponent(topic)}&week=${encodeURIComponent(weekNum)}&subtopic=${encodeURIComponent(number)}${bankTaken ? '&view=true' : ''}&bank=1`);
              }}
            >
              {bankTaken ? '查看题库测验' : '题库测验'}
            </button>
          </div>

          <div className="quiz-action-row">
            <div className="quiz-score-slot">
              {aiTaken && aiScore !== undefined && aiScore !== null ? <div className="quiz-score">{`${aiScore}%`}</div> : null}
            </div>
            <button
              className="quizButton"
              onClick={() => {
                navigate(`${ROUTES.QUIZ}?topic=${encodeURIComponent(topic)}&week=${encodeURIComponent(weekNum)}&subtopic=${encodeURIComponent(number)}${aiTaken ? '&view=true' : ''}`);
              }}
            >
              {aiTaken ? '查看AI测验' : 'AI测验'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const TopicBar = ({
    week,
    topic,
    color,
    subtopics,
    style,
    children,
    weekNum,
    quizStats,
  }) => {
    const [open, setOpen] = useState(false);
    return (
      <div style={style}>
        <div className="topic-bar" style={{ "--clr": color }}>
          <div className="topic-bar-title">
            <h3 className="week" style={{ fontWeight: "400", textTransform: "capitalize" }}>
              {week}
            </h3>
            <h2 style={{ fontWeight: "400", textTransform: "capitalize", color: "white" }}>
              {topic}
            </h2>
          </div>
          <button
            className="plus"
            style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
            onClick={() => setOpen(!open)}
          >
            <ChevronRight size={50} strokeWidth={2} color={color}></ChevronRight>
          </button>
          <div className="subtopics" style={{ display: open ? "block" : "none" }}>
            {subtopics?.map((subtopic, i) => (
              <Subtopic
                subtopic={subtopic}
                number={i + 1}
                weekNum={weekNum}
                weekTitle={week}
                weekTopic={topic}
                quizStats={quizStats[i + 1] || {}}
              ></Subtopic>
            ))}
          </div>
        </div>

        {children}
      </div>
    );
  };

  const handleGenerateAIResource = (forceRegenerate = false) => {
    setLoading(true);
    axios.defaults.baseURL = API_BASE;

    axios({
      method: "POST",
      url: "/api/generate-resource",
      data: {
        ...resourceParam,
        regenerate: forceRegenerate || regenerateResource,
      },
      withCredentials: true,
    })
      .then((res) => {
        setLoading(false);
        setResourceMode("ai");
        setResources(
          <div className="res">
            <h2 className="res-heading">{resourceParam.subtopic}</h2>
            <Markdown>{res.data}</Markdown>
          </div>
        );
        setRegenerateResource(false);
        setTimeout(() => {
          setConfettiExplode(true);
          console.log("exploding confetti...");
        }, 500);
      })
      .catch(() => {
        setLoading(false);
        alert("生成资源时出错");
      });
  };

  const renderVideoResources = (payload, fallbackPage = 1, addedKeywordText = "") => {
    const courses = Array.isArray(payload?.courses) ? payload.courses : [];
    const usedKeyword = payload?.keyword || "";
    const pageNum = payload?.page || fallbackPage;
    const addedKeyword = (addedKeywordText || payload?.extra_keyword_cn || payload?.extra_keyword || "").trim();

    const headline = addedKeyword
      ? `找到 ${courses.length} 个相关课程(搜索: ${usedKeyword}，已添加关键词: ${addedKeyword}，第 ${pageNum} 页)`
      : `找到 ${courses.length} 个相关课程(搜索: ${usedKeyword}，第 ${pageNum} 页)`;

    if (!courses.length) {
      return (
        <div className="res">
          <h2 className="res-heading">在线课程 - {resourceParam.subtopic}</h2>
          <p style={{ color: "#999", marginTop: "2em" }}>
            抱歉,未找到相关课程。搜索关键词: {usedKeyword}
            {addedKeyword ? `（已添加: ${addedKeyword}）` : ""}
          </p>
          <p style={{ color: "#999", marginTop: "1em" }}>
            建议尝试:
            <br />添加更具体的关键词后重新搜索
            <br />或使用左侧 AI 生成学习资源
          </p>
        </div>
      );
    }

    return (
      <div className="res">
        <h2 className="res-heading">在线课程 - {resourceParam.subtopic}</h2>
        <p style={{ fontSize: "0.9em", color: "#666", marginBottom: "1em" }}>{headline}</p>
        <div className="course-list">
          {courses.map((course, index) => (
            <div
              key={index}
              className="course-item"
              style={{
                border: "1px solid #ddd",
                padding: "1em",
                marginBottom: "1em",
                borderRadius: "8px",
              }}
            >
              <h3 style={{ marginBottom: "0.5em" }}>
                <a
                  href={course.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#00A1D6", textDecoration: "none" }}
                >
                  {course.title}
                </a>
              </h3>
              <p style={{ fontSize: "0.9em", color: "#666", marginBottom: "0.5em" }}>
                UP主 {course.author} | 播放量 {course.play}
              </p>
              <p style={{ fontSize: "0.85em", color: "#999" }}>{course.description}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const handleSearchBilibili = (extraKeyword = "", refresh = false, targetPage = null) => {
    const refinedKeyword = (extraKeyword || "").trim();
    const searchPage = targetPage && targetPage > 0
      ? targetPage
      : (refresh ? Math.floor(Math.random() * 5) + 2 : 1);
    const cacheKey = `${resourceParam.course || ""}::${resourceParam.week_topic || ""}::${resourceParam.subtopic || ""}::${refinedKeyword.toLowerCase()}::${searchPage}`;

    if (!refresh && videoResultCacheRef.current[cacheKey]) {
      const cached = videoResultCacheRef.current[cacheKey];
      setResourceMode("video");
      setVideoSearchPage(cached.page || searchPage);
      setResources(renderVideoResources(cached.payload, cached.page || searchPage, cached.addedKeyword));
      setTimeout(() => {
        setConfettiExplode(true);
      }, 120);
      return;
    }

    setLoading(true);
    axios.defaults.baseURL = API_BASE;

    axios({
      method: "POST",
      url: "/api/search-bilibili",
      data: {
        subtopic: resourceParam.subtopic,
        course: resourceParam.course,
        week_topic: resourceParam.week_topic,
        extra_keyword: refinedKeyword,
        refresh,
        page: searchPage,
      },
      withCredentials: true,
    })
      .then((res) => {
        setLoading(false);
        setResourceMode("video");
        const resolvedPage = res.data.page || searchPage;
        const addedKeyword = (res.data.extra_keyword_cn || refinedKeyword || "").trim();
        videoResultCacheRef.current[cacheKey] = {
          payload: res.data,
          page: resolvedPage,
          addedKeyword,
        };
        setVideoSearchPage(resolvedPage);
        setResources(renderVideoResources(res.data, resolvedPage, addedKeyword));

        setTimeout(() => {
          setConfettiExplode(true);
        }, 500);
      })
      .catch((err) => {
        setLoading(false);
        alert("搜索课程时出错，请稍后重试");
        console.error(err);
      });
  };
    

  const ResourcesSection = ({ children }) => {
    return (
      <div className="flexbox resources">
        <div className="generativeFill">
          <button
            className="primary"
            onClick={() => handleGenerateAIResource(false)}
          >
            <Bot size={70} strokeWidth={1} className="icon"></Bot>
            AI生成学习资源
          </button>
          {/* <div style={{ marginTop: "1em", textAlign: "center" }}>  
              <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5em" }}>  
                  <input  
                      type="checkbox"  
                      checked={regenerateResource}  
                      onChange={(e) => setRegenerateResource(e.target.checked)}  
                  />  
                  重新生成（不使用缓存）
              </label>  
          </div> */}
        </div>
        {/* OR */}
        <div className="databaseFill">
          <button
            className="primary"
            id="searchWidgetTrigger"
            onClick={() => handleSearchBilibili("")}
          >
            <FolderSearch
              size={70}
              strokeWidth={1}
              className="icon"
            ></FolderSearch>
            浏览在线课程
          </button>
        </div>
      </div>
    );
  };

  const handleRegenerateRoadmap = async () => {  
    // 使用模态对话框替代 window.confirm：先询问是否保留设置
    return new Promise((resolve) => {
      setConfirmOptions({
        title: '保留设置？',
        message: '是否保留原来的学习时间和基础？(确定=保留，取消=重新设置)',
        primaryText: '保留',
        secondaryText: '不保留',
        onConfirm: async () => {
          setConfirmOpen(false);
          // 用户选择保留，则再询问是否确认重新生成
          setConfirmOptions({
            title: '确认重新生成',
            message: '重新生成会先删除现有学习路径和相关资源，是否继续？',
            primaryText: '确认',
            secondaryText: '取消',
            onConfirm: async () => {
              setConfirmOpen(false);
              // 执行保留设置的重新生成逻辑
              setRegenerating(true);
              try {
                axios.defaults.baseURL = API_BASE;
                const delRes = await axios({
                  method: 'POST',
                  url: '/api/cancel-course',
                  data: { course: topic },
                  withCredentials: true,
                });

                if (!(delRes.data && delRes.data.success)) {
                  alert('删除原有路径失败，已停止重新生成');
                  setRegenerating(false);
                  resolve(false);
                  return;
                }

                // 本地清理
                try {
                  const roadmaps = JSON.parse(localStorage.getItem('roadmaps')) || {};
                  delete roadmaps[topic];
                  localStorage.setItem('roadmaps', JSON.stringify(roadmaps));

                  const topics = JSON.parse(localStorage.getItem('topics')) || {};
                  delete topics[topic];
                  localStorage.setItem('topics', JSON.stringify(topics));

                  const stats = JSON.parse(localStorage.getItem('quizStats')) || {};
                  delete stats[topic];
                  localStorage.setItem('quizStats', JSON.stringify(stats));
                } catch (e) {
                  console.warn('清理 localStorage 时出错', e);
                }

                // 再生成新的路线图（保持原 time/knowledge）
                const response = await axios({
                  method: 'POST',
                  url: '/api/roadmap',
                  data: {
                    topic: topic,
                    time: topicDetails.time,
                    knowledge_level: topicDetails.knowledge_level,
                    regenerate: true,
                  },
                  withCredentials: true,
                });

                setRoadmap(response.data);

                // 更新 localStorage
                const roadmaps = JSON.parse(localStorage.getItem('roadmaps')) || {};
                roadmaps[topic] = response.data;
                localStorage.setItem('roadmaps', JSON.stringify(roadmaps));

                // 恢复 topics 中的时间和知识水平
                try {
                  const topics = JSON.parse(localStorage.getItem('topics')) || {};
                  topics[topic] = { ...topics[topic], time: topicDetails.time, knowledge_level: topicDetails.knowledge_level };
                  localStorage.setItem('topics', JSON.stringify(topics));
                  setTopicDetails({ time: topicDetails.time, knowledge_level: topicDetails.knowledge_level });
                } catch (e) {
                  console.warn('更新 topics 本地存储失败', e);
                }
                resolve(true);
              } catch (error) {
                console.error('重新生成路线图失败', error);
                alert('重新生成路线图失败，请稍后重试');
                resolve(false);
              } finally {
                setRegenerating(false);
              }
            },
            onCancel: () => {
              setConfirmOpen(false);
              resolve(false);
            },
          });
          setConfirmOpen(true);
        },
        onCancel: () => {
          setConfirmOpen(false);
          // 用户选择不保留设置：直接跳转到选择页（在选择页点击开始学习会自动删除旧数据并生成）
          navigate(ROUTES.TOPIC + '?topic=' + encodeURIComponent(topic) + '&regenerate=true');
          resolve(true);
        },
      });
      setConfirmOpen(true);
    });
  };

  const handleCancelCourse = async () => {
    // 使用模态确认
    setConfirmOptions({
      title: `确认取消《${topic}》？`,
      message: '这将删除该课程的所有本地和服务器数据，操作不可撤销。',
      primaryText: '确认取消',
      secondaryText: '取消',
      onConfirm: async () => {
        setConfirmOpen(false);
        setCanceling(true);
        try {
          axios.defaults.baseURL = API_BASE;
          const res = await axios({
            method: "POST",
            url: "/api/cancel-course",
            data: { course: topic },
            withCredentials: true,
          });

          if (res.data && res.data.success) {
            // 从 localStorage 中移除相关数据
            try {
              const roadmaps = JSON.parse(localStorage.getItem('roadmaps')) || {};
              delete roadmaps[topic];
              localStorage.setItem('roadmaps', JSON.stringify(roadmaps));

              const topics = JSON.parse(localStorage.getItem('topics')) || {};
              delete topics[topic];
              localStorage.setItem('topics', JSON.stringify(topics));

              const stats = JSON.parse(localStorage.getItem('quizStats')) || {};
              delete stats[topic];
              localStorage.setItem('quizStats', JSON.stringify(stats));
            } catch (e) {
              console.warn('清理 localStorage 时出错', e);
            }

            navigate('/');
          } else {
            alert('取消学习失败，请稍后重试');
          }
        } catch (err) {
          console.error(err);
          alert('取消学习时出错，请稍后重试');
        } finally {
          setCanceling(false);
        }
      },
      onCancel: () => {
        setConfirmOpen(false);
      },
    });
    setConfirmOpen(true);
  };

  return (
    <div className="roadmap_wrapper">
      {/* 通用确认模态（用于取消学习 / 重新生成确认）- 顶层，背景为当前页面并虚化 */}
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} simple={true}>
        <div className="confirm-box">
          <h2>{confirmOptions.title}</h2>
          <p>{confirmOptions.message}</p>
          <div className="confirm-actions">
            <button
              className="confirm-no"
              onClick={() => {
                confirmOptions.onCancel && confirmOptions.onCancel();
              }}
            >
              {confirmOptions.secondaryText || '取消'}
            </button>
            <button
              className="confirm-yes"
              onClick={() => {
                confirmOptions.onConfirm && confirmOptions.onConfirm();
              }}
            >
              {confirmOptions.primaryText || '确认'}
            </button>
          </div>
        </div>
      </Modal>
      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setResources(null);
          setResourceMode("ai");
          setVideoKeywordInput("");
          setVideoSearchPage(1);
          videoResultCacheRef.current = {};
        }}
      >
        {!resources ? (
          <ResourcesSection></ResourcesSection>
        ) : (
          <>
            {confettiExplode && (
              <ConfettiExplosion zIndex={10000} style={{ margin: "auto" }} />
            )}

            <div style={{ position: 'relative' }}>  
              {resources}  
                
              {/* 在内容底部添加重新生成按钮 */}  
              <div style={{   
                marginTop: "2em",   
                textAlign: "center",   
                borderTop: "1px solid #eee",   
                paddingTop: "1.5em"   
              }}>  
                {resourceMode === "video" ? (
                  <div style={{ display: "flex", gap: "0.6em", justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      value={videoKeywordInput}
                      onChange={(e) => setVideoKeywordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        const kw = (videoKeywordInput || "").trim();
                        if (!kw) {
                          alert("请先输入关键词");
                          return;
                        }
                        handleSearchBilibili(kw, false, 1);
                      }}
                      placeholder="添加关键词，例如：零基础 / 项目实战"
                      style={{
                        minWidth: "280px",
                        maxWidth: "420px",
                        width: "56%",
                        padding: "0.65em 0.8em",
                        border: "1px solid #cfd8dc",
                        borderRadius: "5px",
                        fontSize: "0.95em",
                      }}
                    />
                    <button
                      onClick={() => {
                        const kw = (videoKeywordInput || "").trim();
                        if (!kw) {
                          alert("请先输入关键词");
                          return;
                        }
                        handleSearchBilibili(kw, false, 1);
                      }}
                      style={{
                        padding: "0.8em 1.4em",
                        backgroundColor: "#4EAAD1",
                        color: "white",
                        border: "none",
                        borderRadius: "5px",
                        cursor: "pointer",
                        fontSize: "1em",
                      }}
                    >
                      添加关键词重新搜索
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setRegenerateResource(true);
                      handleGenerateAIResource(true);
                    }}
                    style={{
                      padding: "0.8em 2em",
                      backgroundColor: "#4EAAD1",
                      color: "white",
                      border: "none",
                      borderRadius: "5px",
                      cursor: "pointer",
                      fontSize: "1em",
                    }}
                  >
                    重新生成AI学习资源
                  </button>
                )}

                {resourceMode === "video" ? (
                  <div style={{ display: "flex", gap: "0.6em", justifyContent: "center", alignItems: "center", marginTop: "0.7em" }}>
                    <button
                      onClick={() => handleSearchBilibili(videoKeywordInput, false, Math.max(1, videoSearchPage - 1))}
                      disabled={videoSearchPage <= 1}
                      style={{
                        padding: "0.6em 1.1em",
                        backgroundColor: videoSearchPage <= 1 ? "#b0bec5" : "#607d8b",
                        color: "white",
                        border: "none",
                        borderRadius: "5px",
                        cursor: videoSearchPage <= 1 ? "not-allowed" : "pointer",
                        fontSize: "0.95em",
                      }}
                    >
                      上一页
                    </button>
                    <button
                      onClick={() => handleSearchBilibili(videoKeywordInput, false, videoSearchPage + 1)}
                      style={{
                        padding: "0.6em 1.1em",
                        backgroundColor: "#607d8b",
                        color: "white",
                        border: "none",
                        borderRadius: "5px",
                        cursor: "pointer",
                        fontSize: "0.95em",
                      }}
                    >
                      下一页
                    </button>
                  </div>
                ) : null}

                {resourceMode === "video" ? (
                  <div style={{ marginTop: "0.6em", textAlign: "center", fontSize: "0.82em", color: "#6b7280" }}>
                    当前第 {videoSearchPage} 页
                  </div>
                ) : null}
                </div>  
              </div>  
            </>  
          )}
      </Modal>
      <Header></Header>

      <Loader style={{ display: loading ? "block" : "none" }}>
        Generating Resource...
      </Loader>
      <div className="content">
        <div className="flexbox topic">
          <h1 style={{ display: "inline-block", marginRight: "2ch" }}>
            {topic}
          </h1>
          <h2 style={{ display: "inline-block", color: "#B6B6B6" }}>
            {topicDetails.time}
          </h2>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5cm", marginLeft: "1em" }}>
            <button
              onClick={handleRegenerateRoadmap}
              disabled={regenerating}
              style={{
                padding: "0.5em 1em",
                backgroundColor: "#4EAAD1",
                color: "white",
                border: "none",
                borderRadius: "5px",
                cursor: regenerating ? "not-allowed" : "pointer",
              }}
            >
              {regenerating ? "生成中..." : "重新生成"}
            </button>

            <button
              onClick={handleCancelCourse}
              disabled={canceling}
              style={{
                padding: "0.5em 1em",
                backgroundColor: "#D14E4E",
                color: "white",
                border: "none",
                borderRadius: "5px",
                cursor: canceling ? "not-allowed" : "pointer",
              }}
            >
              {canceling ? "取消中..." : "取消学习"}
            </button>
          </div>
        </div>
        <div className="roadmap">
          {Object.keys(roadmap)
            .sort(
              (a, b) => parseInt(a.split(" ")[1]) - parseInt(b.split(" ")[1])
            )
            .map((week, i) => {
              return (
                <TopicBar
                  weekNum={i + 1}
                  week={week}
                  topic={roadmap[week].topic}
                  subtopics={roadmap[week].subtopics}
                  color={colors[i % colors.length]}
                  quizStats={quizStats[i + 1] || {}}
                ></TopicBar>
              );
            })}
        </div>
      </div>
    </div>
  );
};

export default RoadmapPage;
