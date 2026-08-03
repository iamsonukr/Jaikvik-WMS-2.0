'use client';
import BroadcastDetailWorkspace from '@/components/broadcasts/BroadcastDetailWorkspace';

export default function BroadcastDetailPage() {
  return <BroadcastDetailWorkspace allowedRoles={['master', 'admin']} basePath="/master" />;
}
