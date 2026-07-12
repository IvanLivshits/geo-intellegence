'use client';

import { signIn } from 'next-auth/react';

export interface SessionUser {
  name: string | null;
  image: string | null;
}

export default function UserMenu({ user }: { user: SessionUser | null }) {
  if (!user) {
    return (
      <button
        type="button"
        onClick={() => signIn('google')}
        className="font-mono text-mono-label uppercase tracking-wider text-ash transition-colors hover:text-stellar-white"
      >
        Sign in
      </button>
    );
  }

  const initial = (user.name?.trim()?.[0] ?? '?').toUpperCase();

  return (
    <a
      href="/account"
      title="Account"
      className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-graphite bg-charcoal font-mono text-mono-label text-stellar-white transition-colors hover:border-smoke"
    >
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.image} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        initial
      )}
    </a>
  );
}
