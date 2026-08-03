'use client';
import BroadcastDetailWorkspace from '@/components/broadcasts/BroadcastDetailWorkspace';

export default function AdminBroadcastDetailPage() {
  return <BroadcastDetailWorkspace allowedRoles={['admin']} basePath="/admin" />;
}
