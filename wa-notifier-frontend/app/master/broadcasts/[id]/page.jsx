'use client';
import BroadcastDetailWorkspace from '@/components/broadcasts/BroadcastDetailWorkspace';

export default function BroadcastDetailPage() {
  return <BroadcastDetailWorkspace allowedRoles={['admin', 'master']} basePath="/master" />;
}
