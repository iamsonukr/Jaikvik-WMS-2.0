'use client';
import ChatbotWorkspace from '@/components/chatbot/ChatbotWorkspace';

export default function AdminChatbotPage() {
  return <ChatbotWorkspace allowedRoles={['admin']} />;
}
