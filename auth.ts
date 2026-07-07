import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { upsertUser } from '@/lib/user-store';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: 'jwt' },
  trustHost: true,
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const sub = (profile.sub as string | undefined) || (token.sub as string);
        const user = await upsertUser({
          googleSub: sub,
          email: (profile.email as string | undefined) ?? null,
          name: (profile.name as string | undefined) ?? null,
          image: (profile as { picture?: string }).picture ?? null,
        });
        (token as Record<string, unknown>).uid = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      const uid = (token as Record<string, unknown>).uid;
      if (typeof uid === 'string') session.user.id = uid;
      return session;
    },
  },
});
