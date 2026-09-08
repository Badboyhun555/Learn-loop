-- ============================================
-- LEARNLOOP — SUPABASE DATABASE SETUP
-- NO-SALT CUSTOM AUTH
-- SHA-256 PASSWORD HASH
-- ============================================


-- ============================================
-- 0) CLEAN OLD TABLES
-- ============================================
-- WARNING:
-- Ye existing LearnLoop tables aur unka data delete karega.
-- Agar abhi sirf testing chal rahi hai to theek hai.

drop table if exists public.activity_log cascade;
drop table if exists public.ai_questions cascade;
drop table if exists public.challenge_results cascade;
drop table if exists public.topic_progress cascade;
drop table if exists public.topics cascade;
drop table if exists public.subjects cascade;
drop table if exists public.user_progress cascade;
drop table if exists public.user_profiles cascade;
drop table if exists public.users cascade;


-- ============================================
-- 1) USERS TABLE
-- Custom Auth — SHA-256
-- NO SALT
-- ============================================

create table public.users (
    id uuid primary key default gen_random_uuid(),
    name text,
    email text unique not null,
    password_hash text not null,
    created_at timestamptz not null default now()
);


-- ============================================
-- 2) USER PROFILES
-- Onboarding data
-- ============================================

create table public.user_profiles (
    user_id uuid primary key
        references public.users(id)
        on delete cascade,

    year int,
    branch text,
    subjects text[],
    study_time text,
    goal text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);


-- ============================================
-- 3) USER PROGRESS
-- Streak, accuracy, study time
-- ============================================

create table public.user_progress (
    user_id uuid primary key
        references public.users(id)
        on delete cascade,

    streak_count int not null default 0,
    last_active_date date,

    quiz_accuracy int not null default 0,
    study_minutes int not null default 0,

    updated_at timestamptz not null default now()
);


-- ============================================
-- 4) SUBJECTS
-- ============================================

create table public.subjects (
    id text primary key,
    name text not null,
    icon text not null,
    sort_order int not null default 0
);


-- ============================================
-- 5) TOPICS
-- ============================================

create table public.topics (
    id uuid primary key default gen_random_uuid(),

    subject_id text not null
        references public.subjects(id)
        on delete cascade,

    title text not null,
    description text,

    order_number int not null default 0
);


-- ============================================
-- 6) TOPIC PROGRESS
-- Completed lessons
-- ============================================

create table public.topic_progress (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references public.users(id)
        on delete cascade,

    topic_id uuid not null
        references public.topics(id)
        on delete cascade,

    completed boolean not null default true,
    completed_at timestamptz,

    unique (user_id, topic_id)
);


-- ============================================
-- 7) CHALLENGE RESULTS
-- ============================================

create table public.challenge_results (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references public.users(id)
        on delete cascade,

    score int not null,
    total_questions int not null,
    accuracy int not null,

    created_at timestamptz not null default now()
);


-- ============================================
-- 8) AI QUESTIONS HISTORY
-- ============================================

create table public.ai_questions (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references public.users(id)
        on delete cascade,

    subject text,
    question text not null,
    answer text,

    created_at timestamptz not null default now()
);


-- ============================================
-- 9) ACTIVITY LOG
-- ============================================

create table public.activity_log (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references public.users(id)
        on delete cascade,

    activity_type text not null,
    description text,

    created_at timestamptz not null default now()
);


-- ============================================
-- 10) INDEXES
-- Performance ke liye
-- ============================================

create index idx_users_email
on public.users(email);

create index idx_topics_subject_id
on public.topics(subject_id);

create index idx_topic_progress_user_id
on public.topic_progress(user_id);

create index idx_topic_progress_topic_id
on public.topic_progress(topic_id);

create index idx_challenge_results_user_id
on public.challenge_results(user_id);

create index idx_ai_questions_user_id
on public.ai_questions(user_id);

create index idx_activity_log_user_id
on public.activity_log(user_id);


-- ============================================
-- 11) RLS
-- PROTOTYPE / TESTING ONLY
-- ============================================

do $$
declare
    t text;
begin

    foreach t in array array[
        'users',
        'user_profiles',
        'user_progress',
        'subjects',
        'topics',
        'topic_progress',
        'challenge_results',
        'ai_questions',
        'activity_log'
    ]

    loop

        execute format(
            'alter table public.%I enable row level security;',
            t
        );

        execute format(
            'drop policy if exists "prototype_all_access" on public.%I;',
            t
        );

        execute format(
            'create policy "prototype_all_access"
             on public.%I
             for all
             using (true)
             with check (true);',
            t
        );

    end loop;

end $$;


-- ============================================
-- 12) SUBJECT SEED DATA
-- ============================================

insert into public.subjects
    (id, name, icon, sort_order)
values
    ('mathematics', 'Engineering Mathematics', '📐', 1),
    ('physics', 'Engineering Physics', '⚡', 2),
    ('programming', 'Programming', '💻', 3)
on conflict (id)
do update set
    name = excluded.name,
    icon = excluded.icon,
    sort_order = excluded.sort_order;


-- ============================================
-- 13) TOPIC SEED DATA
-- ============================================

insert into public.topics
    (subject_id, title, description, order_number)
values

    -- MATHEMATICS
    (
        'mathematics',
        'Matrices',
        'Learn the basics of matrices, operations and important concepts.',
        1
    ),

    (
        'mathematics',
        'Eigenvalues & Eigenvectors',
        'Understand eigenvalues, eigenvectors and their applications.',
        2
    ),

    (
        'mathematics',
        'Differential Equations',
        'Explore basic differential equations and methods of solving them.',
        3
    ),

    (
        'mathematics',
        'Limits & Continuity',
        'Understand limits, continuity and their real use.',
        4
    ),

    (
        'mathematics',
        'Probability Basics',
        'Learn basic probability and counting methods.',
        5
    ),


    -- PHYSICS
    (
        'physics',
        'Units & Measurements',
        'Learn SI units, dimensional analysis and measurement.',
        1
    ),

    (
        'physics',
        'Newton''s Laws of Motion',
        'Understand force, inertia and the three laws of motion.',
        2
    ),

    (
        'physics',
        'Work, Energy & Power',
        'Learn work, kinetic and potential energy and power.',
        3
    ),

    (
        'physics',
        'Rotational Motion',
        'Study torque, angular momentum and rotation.',
        4
    ),

    (
        'physics',
        'Wave Optics',
        'Learn interference, diffraction and polarization.',
        5
    ),


    -- PROGRAMMING
    (
        'programming',
        'Variables & Data Types',
        'Learn how variables and data types work in C.',
        1
    ),

    (
        'programming',
        'Operators in C',
        'Understand arithmetic, logical and bitwise operators.',
        2
    ),

    (
        'programming',
        'Loops & Conditions',
        'Master if-else, switch, for, while and do-while.',
        3
    ),

    (
        'programming',
        'Functions',
        'Learn how to write and use functions in C.',
        4
    ),

    (
        'programming',
        'Arrays & Strings',
        'Understand arrays, strings and basic operations.',
        5
    );


-- ============================================
-- 14) CHECK TABLES
-- ============================================

select
    table_name
from information_schema.tables
where table_schema = 'public'
and table_name in (
    'users',
    'user_profiles',
    'user_progress',
    'subjects',
    'topics',
    'topic_progress',
    'challenge_results',
    'ai_questions',
    'activity_log'
)
order by table_name;


-- ============================================
-- 15) CHECK SUBJECTS
-- ============================================

select *
from public.subjects
order by sort_order;


-- ============================================
-- 16) CHECK TOPICS
-- ============================================

select
    t.id,
    t.subject_id,
    s.name as subject_name,
    t.title,
    t.description,
    t.order_number
from public.topics t
join public.subjects s
    on s.id = t.subject_id
order by
    s.sort_order,
    t.order_number;
