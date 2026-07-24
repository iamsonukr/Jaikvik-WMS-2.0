'use client';
import ChatbotWorkspace from '@/components/chatbot/ChatbotWorkspace';

export default function ChatbotPage() {
  return <ChatbotWorkspace allowedRoles={['client_owner', 'client_user']} />;
}
