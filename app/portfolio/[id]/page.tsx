import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import PortfolioView from '@/components/PortfolioView';

export const dynamic = 'force-dynamic';

export default async function PortfolioPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/');
  const user = { name: session.user.name ?? null, image: session.user.image ?? null };
  return <PortfolioView id={params.id} user={user} />;
}
