'use client';
import BroadcastsWorkspace from '@/components/broadcasts/BroadcastsWorkspace';

export default function BroadcastsPage() {
  return <BroadcastsWorkspace allowedRoles={['master', 'admin']} basePath="/master" />;
}
