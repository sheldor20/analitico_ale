import { NextResponse } from 'next/server';
import { getVerifiedUser } from '@/lib/auth-server';
export const dynamic = 'force-dynamic';
export async function GET() {
  const user = await getVerifiedUser();
  return NextResponse.json(user ? { userId: user.id } : { error: 'Autenticação necessária.' }, {
    status: user ? 200 : 401, headers: { 'Cache-Control': 'private, no-store' },
  });
}
