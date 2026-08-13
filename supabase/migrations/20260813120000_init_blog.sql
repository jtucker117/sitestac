-- Blog automation ledger. Post bodies live as markdown in src/content/blog/;
-- this tracks what's been written, what's queued, and what still needs review.

create table locations (
  id            bigint generated always as identity primary key,
  city          text not null,
  state         text not null,
  state_abbr    text not null,
  slug_modifier text not null unique,   -- e.g. "houston-tx"
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table blog_posts (
  id               bigint generated always as identity primary key,
  slug             text not null unique,
  title            text not null,
  cluster_id       int not null,
  keyword_targeted text not null,
  post_type        text not null check (post_type in ('pillar', 'supporting', 'local_variant')),
  status           text not null default 'draft'
                     check (status in ('draft', 'pending_review', 'approved', 'published', 'skipped')),
  location_id      bigint references locations(id),
  scheduled_for    date,
  published_at     timestamptz,
  created_at       timestamptz not null default now()
);

-- A topic is never written twice: same keyword + same location can only exist once.
-- coalesce() because NULL <> NULL, so a plain unique constraint would let every
-- location-neutral post be queued over and over.
create unique index blog_posts_keyword_location_uniq
  on blog_posts (keyword_targeted, coalesce(location_id, 0));

create index blog_posts_due_idx on blog_posts (scheduled_for) where published_at is null;

-- Private ledger. The generator authenticates with the service-role key, which
-- bypasses RLS; enabling it keeps the anon key from reading anything.
alter table locations  enable row level security;
alter table blog_posts enable row level security;

insert into locations (city, state, state_abbr, slug_modifier) values
  ('Houston',   'Texas',          'TX', 'houston-tx'),
  ('Dallas',    'Texas',          'TX', 'dallas-tx'),
  ('San Antonio','Texas',         'TX', 'san-antonio-tx'),
  ('Austin',    'Texas',          'TX', 'austin-tx'),
  ('Phoenix',   'Arizona',        'AZ', 'phoenix-az'),
  ('Atlanta',   'Georgia',        'GA', 'atlanta-ga'),
  ('Charlotte', 'North Carolina', 'NC', 'charlotte-nc'),
  ('Nashville', 'Tennessee',      'TN', 'nashville-tn'),
  ('Tampa',     'Florida',        'FL', 'tampa-fl');
