import { redirect } from 'next/navigation';
import LoginForm from '@/components/login-form';
import { getVerifiedUser } from '@/lib/auth-server';
import { getPublicAuthConfig } from '@/lib/auth-policy.mjs';
export const dynamic = 'force-dynamic';
export default async function LoginPage() {
  if (await getVerifiedUser()) redirect('/');
  return <LoginForm configured={Boolean(getPublicAuthConfig())} />;
}
