import { LocaleContext } from "@/i18n/LocaleProvider";
import { ReactNode, useContext } from "react";

export const useMessage = () => {
  const context = useContext(LocaleContext);
  
  if (context === undefined) {
    throw new Error('useMessage must be used within a MessageProvider');
  }

  return {
    info: (content: ReactNode, duration?: number) => context.addMessage(content, 'info', duration),
    success: (content: ReactNode, duration?: number) => context.addMessage(content, 'success', duration),
    warning: (content: ReactNode, duration?: number) => context.addMessage(content, 'warning', duration),
    error: (content: ReactNode, duration?: number) => context.addMessage(content, 'error', duration)
  };
};