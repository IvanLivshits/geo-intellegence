import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { listPortfolios } from '@/lib/portfolio-store';
import PortfolioIndex from '@/components/PortfolioIndex';

export const dynamic = 'force-dynamic';

export default async function PortfolioIndexPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/api/auth/signin?callbackUrl=/portfolio');

  const portfolios = await listPortfolios(session.user.id);
  const user = { name: session.user.name ?? null, image: session.user.image ?? null };
  return <PortfolioIndex portfolios={portfolios} user={user} />;
}
