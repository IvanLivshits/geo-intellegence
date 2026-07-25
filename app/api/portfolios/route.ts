import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sameOrigin } from '@/lib/csrf';
import { parsePortfolioCsv } from '@/lib/portfolio';
import {
  countActivePortfolios,
  createPortfolio,
  listPortfolios,
  PortfolioLimitError,
} from '@/lib/portfolio-store';
import { RADIUS, RADIUS_MAX, RADIUS_MIN } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 2000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ACTIVE_PORTFOLIOS = 2;

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });
  return NextResponse.json(await listPortfolios(userId));
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new NextResponse('Cross-origin forbidden', { status: 403 });

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return new NextResponse(`The file is too large (limit ${MAX_BYTES / 1024 / 1024} MB)`, { status: 413 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BYTES) {
    return new NextResponse(`The file is too large (limit ${MAX_BYTES / 1024 / 1024} MB)`, { status: 413 });
  }

  let body: { name?: string; csv?: string; radius?: number };
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse('JSON body required', { status: 400 });
  }

  const csv = typeof body.csv === 'string' ? body.csv : '';
  if (!csv.trim()) return new NextResponse('The csv field is required', { status: 400 });

  const active = await countActivePortfolios(userId);
  if (active >= MAX_ACTIVE_PORTFOLIOS) {
    return new NextResponse(
      `You already have ${active} portfolio(s) scanning. Wait for them to finish before uploading another.`,
      { status: 429 },
    );
  }

  const radius = Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, Number(body.radius) || RADIUS));
  const name = (body.name || 'portfolio').slice(0, 120);

  let rows;
  try {
    rows = parsePortfolioCsv(csv);
  } catch (err) {
    return new NextResponse(err instanceof Error ? err.message : 'Could not parse the file', { status: 400 });
  }

  if (rows.length > MAX_ROWS) {
    return new NextResponse(`Too many rows: ${rows.length}. The current limit is ${MAX_ROWS}.`, { status: 413 });
  }

  try {
    const id = await createPortfolio(userId, name, radius, rows, MAX_ACTIVE_PORTFOLIOS);
    return NextResponse.json({ id, total: rows.length });
  } catch (err) {
    if (err instanceof PortfolioLimitError) {
      return new NextResponse(
        `You already have ${err.active} portfolio(s) scanning. Wait for them to finish before uploading another.`,
        { status: 429 },
      );
    }
    return new NextResponse(
      `Could not create the portfolio: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500 },
    );
  }
}
