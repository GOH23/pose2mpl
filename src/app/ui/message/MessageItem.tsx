import { Info, CheckCircle, AlertTriangle, AlertCircle } from "lucide-react";
import { ReactNode } from "react";

export const MessageItem = ({ 
  id, 
  content, 
  type, 
  visible 
}: { 
  id: string; 
  content: ReactNode; 
  type: 'info' | 'success' | 'warning' | 'error'; 
  visible: boolean;
}) => {
  // Glass UI стили для разных типов сообщений
  const glassStyles = {
    info: 'bg-blue-500/10 border-blue-400/30 text-blue-200 backdrop-blur-sm',
    success: 'bg-green-500/10 border-green-400/30 text-green-200 backdrop-blur-sm',
    warning: 'bg-yellow-500/10 border-yellow-400/30 text-yellow-200 backdrop-blur-sm',
    error: 'bg-red-500/10 border-red-400/30 text-red-200 backdrop-blur-sm'
  };

  const iconStyles = {
    info: 'text-blue-300',
    success: 'text-green-300',
    warning: 'text-yellow-300',
    error: 'text-red-300'
  };

  const icons = {
    info: <Info size={18} className={iconStyles.info} />,
    success: <CheckCircle size={18} className={iconStyles.success} />,
    warning: <AlertTriangle size={18} className={iconStyles.warning} />,
    error: <AlertCircle size={18} className={iconStyles.error} />
  };

  return (
    <div 
      className={`
        ${glassStyles[type]} 
        rounded-xl border p-3 sm:p-4 
        transform transition-all duration-300 ease-in-out
        ${visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
        pointer-events-auto relative overflow-hidden
        shadow-lg
      `}
    >
      <div className="flex items-start">
        <div className="mt-0.5 mr-3 flex-shrink-0">
          {icons[type]}
        </div>
        <div className="flex-1 text-sm sm:text-base font-medium">
          {content}
        </div>
      </div>
      
      {/* Анимация волны для Glass UI */}
      <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent opacity-0 animate-pulse" />
    </div>
  );
};
