'use client';
import BroadcastsWorkspace from '@/components/broadcasts/BroadcastsWorkspace';

export default function BroadcastsPage() {
  return <BroadcastsWorkspace allowedRoles={['client_owner', 'client_user']} basePath="/client" />;
}
