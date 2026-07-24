'use client';
import BroadcastDetailWorkspace from '@/components/broadcasts/BroadcastDetailWorkspace';

export default function BroadcastDetailPage() {
  return <BroadcastDetailWorkspace allowedRoles={['client_owner', 'client_user']} basePath="/client" />;
}
