import { ArrowUp, Undo2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import "./floatingTools.css";

const FloatingTools = () => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/");
  };

  const handleToTop = () => {
    const smooth = { top: 0, behavior: "smooth" };
    try {
      window.scrollTo(smooth);
    } catch (e) {
      window.scrollTo(0, 0);
    }

    const root = document.getElementById("root");
    if (root && typeof root.scrollTo === "function") {
      try {
        root.scrollTo(smooth);
      } catch (e) {
        root.scrollTop = 0;
      }
    }

    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;

    const containers = document.querySelectorAll(".content, .res, .question-bank-content, .settings_content");
    containers.forEach((node) => {
      if (node && typeof node.scrollTo === "function") {
        try {
          node.scrollTo(smooth);
        } catch (e) {
          node.scrollTop = 0;
        }
      }
    });
  };

  return (
    <div className="floating-tools">
      <button type="button" title="返回上一页" onClick={handleBack}>
        <Undo2 size={20} strokeWidth={2} />
      </button>
      <button type="button" title="返回顶部" onClick={handleToTop}>
        <ArrowUp size={20} strokeWidth={2} />
      </button>
    </div>
  );
};

export default FloatingTools;
