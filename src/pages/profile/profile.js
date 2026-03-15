import { useEffect, useState } from "react";
import { ROUTES } from '../../routes';
import { useNavigate, NavLink } from "react-router-dom";
import "./profile.css";
import Header from "../../components/header/header";
import { ArrowRight, Plus } from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import userManager from "../../utils/userManager";

const PROFILE_COLORS = [
  "#9A9AD9",
  "#FF6B6B",
  "#4ECDC4",
  "#FFE66D",
  "#95E1D3",
  "#F38181",
  "#FCBAD3",
];

const getStats = (roadmaps, quizStats) => {
  const stats = {};
  stats.progress = {};
  for (let topic in quizStats) {
    let numWeightage = 0;
    let completedWeightage = 0;
    Object.keys(roadmaps[topic]).forEach((week, i) => {
      roadmaps[topic][week].subtopics.forEach((subtopic, j) => {
        numWeightage += parseInt(subtopic.time.replace(/^\D+/g, ""));
        if (
          quizStats[topic] &&
          quizStats[topic][i + 1] &&
          quizStats[topic][i + 1][j + 1]
        ) {
          const node = quizStats[topic][i + 1][j + 1];
          const hasAnyCompleted = Boolean(
            node?.ai?.completedAt || node?.ai?.timeTaken ||
            node?.bank?.completedAt || node?.bank?.timeTaken ||
            node?.completedAt || node?.timeTaken
          );
          if (hasAnyCompleted) {
            completedWeightage += parseInt(subtopic.time.replace(/^\D+/g, ""));
          }
        }
      });
    });
    stats.progress[topic] = {
      total: numWeightage,
      completed: completedWeightage,
    };
  }
  console.log(stats);
  return stats;
};
const TopicButton = ({ children }) => {
  const navigate = useNavigate();
  return (
    <button
      className="SubmitButton"
      onClick={() => {
        navigate(ROUTES.TOPIC + '/');
      }}
    >
      {children}
    </button>
  );
};
const ProfilePage = (props) => {
  ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
  );
  const topics = JSON.parse(localStorage.getItem("topics")) || {};
  const [stats, setStats] = useState({});
  const [percentCompletedData, setPercentCompletedData] = useState({});
  const displayName = userManager.getUsername() || "用户";
  const avatarUrl = userManager.getAvatarUrl() || "/avatar.jpg";

  useEffect(() => {
    // Cleanup legacy local difficulty key removed from current product logic.
    localStorage.removeItem("hardnessIndex");
    const roadmaps = JSON.parse(localStorage.getItem("roadmaps")) || {};
    const quizStats = JSON.parse(localStorage.getItem("quizStats")) || {};
    setStats(getStats(roadmaps, quizStats));
  }, []);
  useEffect(() => {
    let progress = stats.progress || {};
    let labels = Object.keys(progress);
    let data = Object.values(progress).map(
      (topicProgress) => (topicProgress.completed * 100) / topicProgress.total
    );
    let backgroundColors = Object.values(progress).map(
      (topicProgress, index) => PROFILE_COLORS[index % PROFILE_COLORS.length]
    );
    setPercentCompletedData({
      labels: labels,
      datasets: [
        {
          label: "完成百分比",
          data: data,
          backgroundColor: backgroundColors,
          borderColor: backgroundColors,
          borderWidth: 1,
        },
      ],
    });
  }, [stats]);
  return (
    <div className="profile_wrapper">
      <Header></Header>
      <div className="flexbox content">
        <div className="flexbox info">
          <NavLink to={ROUTES.PROFILE} className="profile_link_avatar" title="前往个人中心">
            <img src={avatarUrl} alt="Avatar" className="avatar" onError={(e) => { e.currentTarget.src = "/avatar.jpg"; }} />
          </NavLink>
          <div className="flexbox text">
            <NavLink to={ROUTES.PROFILE} className="profile_link_name" title="前往个人中心">
              <h1>{displayName}</h1>
            </NavLink>
            <h3>
              进行中的课程: <b>{Object.keys(topics).length}</b>
            </h3>
          </div>
        </div>
        <div className="newTopic">
          <TopicButton>
            <h2>
              <Plus
                size={25}
                strokeWidth={2}
                style={{ marginRight: "1ch", scale: "1.2" }}
              ></Plus>
              学习新内容
            </h2>
          </TopicButton>
        </div>

        <div className="courses">
          <h2 className="heading">继续学习</h2>
          <div className="flexbox">
            {Object.keys(topics).map((course, i) => {
              return (
                <NavLink
                  className="link"
                  to={ROUTES.ROADMAP + '?topic=' + encodeURI(course)}
                >
                  <div
                    className="card"
                    style={{ "--clr": PROFILE_COLORS[i % PROFILE_COLORS.length] }}
                  >
                    <div className="title">{course}</div>

                    <div className="time">{topics[course].time}</div>

                    <div className="knowledge_level">
                      {topics[course].knowledge_level}
                    </div>
                    {/* <div className="progressContainer flexbox">
                      <label htmlFor="progresspercent">32% Completed</label>
                      <progress
                        id="progresspercent"
                        value="32"
                        max="100"
                      ></progress>
                    </div> */}
                    <ArrowRight
                      size={50}
                      strokeWidth={2}
                      className="arrow"
                    ></ArrowRight>
                  </div>
                </NavLink>
              );
            })}
          </div>
        </div>
        <div className="progress">
          <h2 className="heading">进度</h2>
          <div className="charts">
            {Object.keys(percentCompletedData).length ? (
              // <div
              //   className="bar"
              //   style={{
              //     maxWidth: "700px",
              //     minHeight: "500px",
              //     filter: "brightness(1.5)",
              //     background: "black",
              //     borderRadius: "30px",
              //     padding: "20px",
              //     margin: "auto",
              //   }}
              // >
              //   <Bar
              //     data={percentCompletedData}
              //     options={{ maintainAspectRatio: false, indexAxis: "y" }}
              //   />
              // </div>
                <div
                  className="bar"
                  style={{  
                    width: "100%",
                    maxWidth: "900px",
                    minHeight: "400px",
                    background: "rgba(0, 0, 0, 0.05)",
                    borderRadius: "20px",
                    padding: "30px",
                    margin: "auto",
                    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)"
                  }}
                >
                  <Bar
                    data={percentCompletedData}
                    options={{
                      maintainAspectRatio: false,
                      indexAxis: "x", // 改为纵向柱状图
                      plugins: {
                        legend: {
                          display: false
                        }
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          max: 100,
                          ticks: {
                            callback: function(value) {
                              return value + '%';
                            }
                          }
                        }
                      }
                    }}
                  />
                </div>
            ) : (
              ""
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
