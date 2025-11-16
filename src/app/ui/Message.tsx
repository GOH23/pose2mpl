import { AlertCircle } from "lucide-react";
import { ReactNode, useState, useEffect } from "react";

interface MessageProps {
  type?: 'info' | 'success' | 'warning' | 'error';
  children: ReactNode;
  closable?: boolean;
  onClose?: () => void;
  className?: string;
  duration?: number;
}

const Message = ({
  type = 'info',
  children,
  closable = false,
  onClose,
  className = '',
  duration
}: MessageProps) => {
  const [visible, setVisible] = useState(true);

  // Auto close after duration
  useEffect(() => {
    if (duration && onClose) {
      const timer = setTimeout(() => {
        setVisible(false);
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  if (!visible) return null;

  // Glass UI styling based on type
  const glassStyle = {
    info: 'bg-white/10 border-blue-300/30 text-blue-200 backdrop-blur-sm',
    success: 'bg-green-500/10 border-green-300/30 text-green-200 backdrop-blur-sm',
    warning: 'bg-yellow-500/10 border-yellow-300/30 text-yellow-200 backdrop-blur-sm',
    error: 'bg-red-500/10 border-red-300/30 text-red-200 backdrop-blur-sm'
  };

  const iconStyle = {
    info: 'text-blue-300',
    success: 'text-green-300',
    warning: 'text-yellow-300',
    error: 'text-red-300'
  };

  return (
    <div className={`
      relative rounded-xl border p-4 mb-4
      ${glassStyle[type]} 
      ${className}
      transition-all duration-300 ease-in-out
      hover:backdrop-blur-md
    `}>
      <div className="flex items-start">
        <div className={`mt-0.5 mr-3 flex-shrink-0 ${iconStyle[type]}`}>
          {type === 'info' && <AlertCircle size={18} />}
          {type === 'success' && <AlertCircle size={18} />}
          {type === 'warning' && <AlertCircle size={18} />}
          {type === 'error' && <AlertCircle size={18} />}
        </div>
        <div className="flex-1 text-sm font-medium">
          {children}
        </div>
        {closable && (
          <button
            onClick={() => {
              setVisible(false);
              if (onClose) onClose();
            }}
            className={`ml-3 text-${type}-300 hover:text-${type}-400 transition-colors`}
            aria-label="Close message"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
};