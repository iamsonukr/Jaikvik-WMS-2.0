'use client';
import InboxWorkspace from '@/components/inbox/InboxWorkspace';

export default function InboxPage() {
  return <InboxWorkspace allowedRoles={['client_owner', 'client_user']} />;
}
