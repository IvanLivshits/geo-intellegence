import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getBrand } from '@/lib/user-store';
import BrandSettings from '@/components/BrandSettings';

export const dynamic = 'force-dynamic';

export default async function BrandPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/api/auth/signin?callbackUrl=/account/brand');

  const initial = await getBrand(session.user.id);
  const user = { name: session.user.name ?? null, image: session.user.image ?? null };
  return <BrandSettings user={user} initial={initial} />;
}
