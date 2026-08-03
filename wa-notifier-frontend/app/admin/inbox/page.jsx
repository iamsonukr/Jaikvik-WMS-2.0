'use client';
import InboxWorkspace from '@/components/inbox/InboxWorkspace';

export default function AdminInboxPage() {
  return <InboxWorkspace allowedRoles={['admin']} />;
}
