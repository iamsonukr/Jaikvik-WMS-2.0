'use client';
import NewBroadcastWorkspace from '@/components/broadcasts/NewBroadcastWorkspace';

export default function AdminNewBroadcastPage() {
  return <NewBroadcastWorkspace allowedRoles={['admin']} basePath="/admin" />;
}
