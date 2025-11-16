import { ReactNode } from "react";
import { MessageItem } from "./MessageItem";

export const MessageContainer = ({ messages }: { messages: Array<{
  id: string;
  content: ReactNode;
  type: 'info' | 'success' | 'warning' | 'error';
  visible: boolean;
}> }) => {
  if (messages.length === 0) return null;

  return (
    <div className="fixed top-24 right-4 z-[9999] max-w-md w-full pointer-events-none">
      <div className="space-y-2">
        {messages.map(message => (
          <MessageItem 
            key={message.id} 
            {...message} 
          />
        ))}
      </div>
    </div>
  );
};
