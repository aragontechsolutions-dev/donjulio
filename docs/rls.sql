-- ─────────────────────────────────────────────────────────────────────────
-- Don Julio — Cierre de acceso directo a la base (RLS)
-- ─────────────────────────────────────────────────────────────────────────
-- Contexto: la API (NestJS + Prisma) se conecta con el usuario dueño de la
-- base, que en Supabase tiene BYPASSRLS. Los roles `anon` y `authenticated`
-- son los que usa la API REST/PostgREST pública de Supabase (la que queda
-- expuesta con la anon key en el navegador).
--
-- Objetivo: habilitar RLS en todas las tablas de `public` SIN crear políticas.
-- Sin políticas, RLS deniega todo para anon/authenticated, mientras que la app
-- sigue funcionando igual porque Prisma conecta como owner.
--
-- Cómo correrlo: Supabase → SQL Editor → pegar y ejecutar. Es idempotente.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Habilita RLS en todas las tablas del schema public.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE '_prisma%'   -- tabla interna de migraciones
  LOOP
    -- Sólo ENABLE (no FORCE): el dueño de la tabla —con el que conecta
    -- Prisma— sigue teniendo acceso, y anon/authenticated quedan denegados.
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t.tablename);
  END LOOP;
END $$;

-- 2) Quita privilegios directos a los roles públicos de Supabase.
--    (defensa en profundidad: aunque alguien cree una política por error,
--    estos roles no tienen GRANT sobre las tablas).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- 3) Y también para las tablas que se creen a futuro (nuevas migraciones).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Verificación: todas deben quedar con rowsecurity = true.
-- ─────────────────────────────────────────────────────────────────────────
SELECT tablename, rowsecurity AS rls_habilitado
FROM pg_tables
WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
ORDER BY rowsecurity, tablename;

-- Debe devolver 0 filas (ninguna política abierta por accidente):
-- SELECT * FROM pg_policies WHERE schemaname = 'public';
