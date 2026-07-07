import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { listLocations } from '@/lib/user-store';
import AccountClient from '@/components/AccountClient';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/api/auth/signin?callbackUrl=/account');

  const locations = await listLocations(session.user.id);

  return (
    <AccountClient
      user={{
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        image: session.user.image ?? null,
      }}
      locations={locations}
    />
  );
}
