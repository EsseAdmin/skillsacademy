-- Fills the "brightwave" academy with a realistically sized dataset for timing the app:
-- 300 learners, 30 courses (10 modules each), ~3,000 enrolments, ~12,000 module completions.
-- Run against a throwaway database after the app has started once (so the schema exists).
WITH a AS (SELECT id FROM academies WHERE slug = 'brightwave'),
     adm AS (SELECT id FROM users WHERE academy_id = (SELECT id FROM a) AND role = 'ACADEMY_ADMIN' LIMIT 1)
INSERT INTO users (id, academy_id, role, name, email, password_hash, is_active, created_at, email_verified_at)
SELECT gen_random_uuid()::text, (SELECT id FROM a), 'LEARNER', 'Load Learner ' || g, 'load' || g || '@perf.example', 'x', 1, now()::text, now()::text FROM generate_series(1, 300) g;

INSERT INTO courses (id, academy_id, created_by, title, description, category, price_pence, is_published, cover_emoji, created_at, updated_at)
SELECT gen_random_uuid()::text, (SELECT id FROM academies WHERE slug='brightwave'), (SELECT id FROM users WHERE role='ACADEMY_ADMIN' AND academy_id=(SELECT id FROM academies WHERE slug='brightwave') LIMIT 1),
       'Load course ' || g, 'A generated course for load testing.', 'General', 0, 1, '📘', now()::text, now()::text FROM generate_series(1, 30) g;

INSERT INTO modules (id, academy_id, created_by, title, description, content_type, content_text, created_at, updated_at)
SELECT gen_random_uuid()::text, (SELECT id FROM academies WHERE slug='brightwave'), (SELECT id FROM users WHERE role='ACADEMY_ADMIN' AND academy_id=(SELECT id FROM academies WHERE slug='brightwave') LIMIT 1),
       'Load module ' || g, 'Generated.', 'TEXT', repeat('Lorem ipsum. ', 200), now()::text, now()::text FROM generate_series(1, 300) g;

-- 10 modules per generated course
INSERT INTO course_modules (id, course_id, module_id, order_index)
SELECT gen_random_uuid()::text, c.id, m.id, ((m.rn - 1) % 10)
FROM (SELECT id, row_number() OVER (ORDER BY title) - 1 AS cn FROM courses WHERE title LIKE 'Load course %') c
JOIN (SELECT id, row_number() OVER (ORDER BY title) - 1 AS rn FROM modules WHERE title LIKE 'Load module %') m ON (m.rn / 10) = c.cn;

-- each learner enrols in 10 courses
INSERT INTO enrollments (id, academy_id, course_id, learner_id, status, payment_status, progress_pct, enrolled_at)
SELECT gen_random_uuid()::text, (SELECT id FROM academies WHERE slug='brightwave'), c.id, u.id, 'active', 'free', 0, (now() - (random() * interval '60 days'))::text
FROM (SELECT id, row_number() OVER (ORDER BY email) AS n FROM users WHERE email LIKE 'load%@perf.example') u
JOIN (SELECT id, row_number() OVER (ORDER BY title) AS n FROM courses WHERE title LIKE 'Load course %') c ON ((c.n + u.n) % 3) = 0;

-- about 4 completions per enrolment
INSERT INTO module_completions (id, enrollment_id, module_id, completed_at)
SELECT gen_random_uuid()::text, e.id, cm.module_id, (now() - (random() * interval '30 days'))::text
FROM enrollments e JOIN course_modules cm ON cm.course_id = e.course_id
WHERE random() < 0.4
ON CONFLICT DO NOTHING;
