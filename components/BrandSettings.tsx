'use client';

import { useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Brand } from '@/lib/types';
import { Button } from './ui/button';
import UserMenu, { type SessionUser } from './UserMenu';

interface BrandForm {
  name: string;
  logo: string;
  phone: string;
  email: string;
  website: string;
}

const BRAND_FIELDS: { key: keyof BrandForm; label: string; placeholder: string; type: string }[] = [
  { key: 'name', label: 'Display name', placeholder: 'Your agency', type: 'text' },
  { key: 'logo', label: 'Logo URL', placeholder: 'https://…/logo.png', type: 'url' },
  { key: 'phone', label: 'Phone', placeholder: '+34 600 000 000', type: 'tel' },
  { key: 'email', label: 'Email', placeholder: 'you@agency.com', type: 'email' },
  { key: 'website', label: 'Website', placeholder: 'https://agency.com', type: 'url' },
];

function toForm(brand: Brand | null): BrandForm {
  return {
    name: brand?.name ?? '',
    logo: brand?.logo ?? '',
    phone: brand?.phone ?? '',
    email: brand?.email ?? '',
    website: brand?.website ?? '',
  };
}

function LogoBox({ src, size }: { src: string; size: number }) {
  const [broken, setBroken] = useState(false);
  const ok = src.trim() && !broken;
  return (
    <div
      className="flex flex-none items-center justify-center overflow-hidden bg-black/5"
      style={{ width: size, height: size }}
    >
      {ok ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="h-full w-full object-contain"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="font-mono text-[9px] uppercase tracking-widest text-smoke">logo</span>
      )}
    </div>
  );
}

function SharePreview({ form }: { form: BrandForm }) {
  const name = form.name.trim() || 'Your agency';
  const contacts = [form.phone, form.email, form.website].map((s) => s.trim()).filter(Boolean);
  return (
    <div className="border border-graphite bg-void-black">
      <div className="flex h-16 items-center gap-3 px-5">
        <LogoBox src={form.logo} size={36} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-sans text-body leading-none text-stellar-white">{name}</span>
          {contacts.length > 0 && (
            <span className="truncate font-mono text-[10px] tracking-wider text-ash">
              {contacts.join(' · ')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function MemoPreview({ form }: { form: BrandForm }) {
  const name = form.name.trim() || 'Your agency';
  const contacts = [form.phone, form.email, form.website].map((s) => s.trim()).filter(Boolean);
  return (
    <div className="bg-white p-6">
      <div className="flex items-center gap-3">
        <LogoBox src={form.logo} size={44} />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="truncate font-sans text-[16px] leading-tight text-[#16181d]">{name}</div>
          {contacts.length > 0 && (
            <div className="flex flex-wrap gap-x-3 font-mono text-[10px] tracking-wider text-[#8b9099]">
              {contacts.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 border-t border-[#e6e7ea] pt-3 font-mono text-[9px] uppercase tracking-widest text-[#b7bbc2]">
        powered by Geo-Intelligence · property risk report
      </div>
    </div>
  );
}

export default function BrandSettings({
  user,
  initial,
}: {
  user: SessionUser | null;
  initial: Brand | null;
}) {
  const [form, setForm] = useState<BrandForm>(toForm(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function set(key: keyof BrandForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function uploadLogo(file: File) {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/me/brand/logo', { method: 'POST', body });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const data = (await res.json()) as { url: string };
      set('logo', data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/me/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-void-black text-stellar-white">
      <header className="flex h-16 flex-none items-center justify-between border-b border-graphite px-5">
        <a
          href="/account"
          className="flex items-center gap-2 font-mono text-mono-badge uppercase tracking-widest text-ash transition-colors hover:text-stellar-white"
        >
          <ArrowLeft size={13} /> Account
        </a>
        <UserMenu user={user} />
      </header>

      <main className="mx-auto grid w-full max-w-page flex-1 grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-2">
        <section className="flex flex-col">
          <h1 className="font-mono text-mono-label uppercase tracking-wider text-ash">
            Client-link branding
          </h1>
          <p className="mt-3 max-w-md font-sans text-body text-ash">
            Shown on the links and risk memos you share with clients. Geo-Intelligence stays as a
            small “powered by”.
          </p>

          <div className="mt-8 flex max-w-md flex-col gap-5">
            {BRAND_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="block">
                  <span className="mb-1.5 block font-mono text-mono-badge uppercase tracking-[0.14em] text-smoke">
                    {f.label}
                  </span>
                  <input
                    type={f.type}
                    value={form[f.key]}
                    placeholder={f.placeholder}
                    onChange={(e) => set(f.key, e.target.value)}
                    className="w-full rounded-none border-b border-graphite bg-transparent pb-1.5 font-sans text-body text-stellar-white outline-none transition-colors placeholder:text-graphite focus:border-stellar-white"
                  />
                </label>
                {f.key === 'logo' && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="border border-graphite px-3 py-1.5 font-mono text-mono-badge uppercase tracking-widest text-ash transition-colors hover:border-smoke hover:text-stellar-white disabled:opacity-40"
                    >
                      {uploading ? 'Uploading…' : 'Upload file'}
                    </button>
                    <span className="font-mono text-[10px] tracking-wider text-smoke">
                      PNG · JPEG · WebP · GIF, ≤ 512 KB
                    </span>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadLogo(file);
                        e.target.value = '';
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {error && (
            <div className="mt-5 max-w-md border border-alert-red/70 px-3 py-2 font-mono text-mono-badge text-alert-red">
              {error}
            </div>
          )}

          <div className="mt-8 flex items-center gap-4">
            <Button onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save brand'}
            </Button>
            {saved && !busy && (
              <span className="font-mono text-mono-badge uppercase tracking-wider text-smoke">
                saved
              </span>
            )}
          </div>
        </section>

        <section className="flex flex-col">
          <div className="font-mono text-mono-badge uppercase tracking-widest text-smoke">
            Live preview
          </div>
          <div className="mt-4 flex flex-col gap-6">
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-ash">
                Shared link header
              </div>
              <SharePreview form={form} />
            </div>
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-ash">
                Risk memo header
              </div>
              <MemoPreview form={form} />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
