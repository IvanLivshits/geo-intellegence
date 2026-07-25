'use client';

import { useEffect, useRef, useState } from 'react';
import { signIn, signOut } from 'next-auth/react';
import { MapPin, Palette, LogOut } from 'lucide-react';

export interface SessionUser {
  name: string | null;
  image: string | null;
}

export default function UserMenu({ user }: { user: SessionUser | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

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
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.name ?? 'Account'}
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-graphite bg-charcoal font-mono text-mono-label text-stellar-white transition-colors hover:border-smoke"
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          initial
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-56 border border-graphite bg-void-black">
          {user.name && (
            <div className="truncate border-b border-graphite px-4 py-3 font-mono text-mono-badge text-ash">
              {user.name}
            </div>
          )}
          <a
            href="/account"
            className="flex items-center gap-3 px-4 py-3 font-mono text-mono-badge uppercase tracking-widest text-ash transition-colors hover:bg-charcoal hover:text-stellar-white"
          >
            <MapPin size={13} /> Saved locations
          </a>
          <a
            href="/account/brand"
            className="flex items-center gap-3 px-4 py-3 font-mono text-mono-badge uppercase tracking-widest text-ash transition-colors hover:bg-charcoal hover:text-stellar-white"
          >
            <Palette size={13} /> Brand settings
          </a>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/' })}
            className="flex w-full items-center gap-3 border-t border-graphite px-4 py-3 font-mono text-mono-badge uppercase tracking-widest text-ash transition-colors hover:bg-charcoal hover:text-stellar-white"
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
