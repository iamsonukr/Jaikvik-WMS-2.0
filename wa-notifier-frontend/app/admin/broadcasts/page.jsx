'use client';
import BroadcastsWorkspace from '@/components/broadcasts/BroadcastsWorkspace';

export default function AdminBroadcastsPage() {
  return <BroadcastsWorkspace allowedRoles={['admin']} basePath="/admin" />;
}
