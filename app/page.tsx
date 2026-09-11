import Dashboard from '@/components/dashboard';
import AuthBoundary from '@/components/auth-boundary';
import { requireUser } from '@/lib/auth-server';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = await requireUser();
  return <AuthBoundary userId={user.id}><Dashboard /></AuthBoundary>;
}
