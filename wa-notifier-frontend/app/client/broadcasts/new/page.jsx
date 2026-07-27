import NewBroadcastWorkspace from '@/components/broadcasts/NewBroadcastWorkspace';

export default function NewBroadcastPage() {
  return <NewBroadcastWorkspace allowedRoles={['client_owner', 'client_user']} basePath="/client" />;
}
