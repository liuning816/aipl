import { X } from "lucide-react";
import "./modal.css";
const Modal = ({ children, open = false, onClose, simple = false, noBlur = false }) => {
  const modalClassName = `flexbox modal${noBlur ? " no-blur" : ""}`;
  if (simple) {
    return (
      <div className={modalClassName} style={{ display: open ? "flex" : "none" }} onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={modalClassName} style={{ display: open ? "flex" : "none" }}>
      <div className="modal-content">
        <button className="cross" onClick={onClose}>
          <X size={30} strokeWidth={1} color="white"></X>
        </button>
        {children}
      </div>
    </div>
  );
};

export default Modal;
