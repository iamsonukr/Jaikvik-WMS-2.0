import NewBroadcastWorkspace from '@/components/broadcasts/NewBroadcastWorkspace';

export default function NewBroadcastPage() {
  return <NewBroadcastWorkspace allowedRoles={['master', 'admin']} basePath="/master" />;
}
