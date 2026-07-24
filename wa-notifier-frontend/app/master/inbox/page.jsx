'use client';
import InboxWorkspace from '@/components/inbox/InboxWorkspace';

export default function InboxPage() {
  return <InboxWorkspace allowedRoles={['admin', 'master']} />;
}
