# Personal Website

Minimalist personal site with a writing archive and an editor workflow.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env.local` from `.env.example` and add your Supabase project values.
3. In Supabase SQL editor, run `supabase/schema.sql`.
4. Create an editor user in Supabase Auth, then mark their profile:

```sql
insert into public.profiles (id, full_name, is_editor)
values ('<user-id>', 'Your Name', true)
on conflict (id) do update set is_editor = true, full_name = excluded.full_name;
```

5. Start the dev server:

```bash
npm run dev
```

Visit `/admin` to sign in and publish posts.

## Deployment

Set the same Supabase env vars in Vercel. The app uses the anon key with row-level security to protect the editor endpoints.

## Notes

- The editor uses TipTap and stores HTML in the `posts.content` column.
- Published posts are visible publicly; drafts stay private.
