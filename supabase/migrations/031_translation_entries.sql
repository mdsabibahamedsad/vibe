-- Migration: Translation Entries for i18n system
-- Creates the translation entries table for admin-managed translations

CREATE TABLE IF NOT EXISTS translation_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    language TEXT NOT NULL,
    namespace TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    is_published BOOLEAN NOT NULL DEFAULT false,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (language, namespace, key)
);

CREATE INDEX IF NOT EXISTS idx_translation_entries_lookup
    ON translation_entries (language, namespace);

CREATE INDEX IF NOT EXISTS idx_translation_entries_key_search
    ON translation_entries USING gin (key gin_trgm_ops);

ALTER TABLE translation_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Translation entries are readable by authenticated users"
    ON translation_entries FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Translation entries are writable by admin users"
    ON translation_entries FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Translation entries are updatable by admin users"
    ON translation_entries FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Translation entries are deletable by super_admin users"
    ON translation_entries FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'super_admin'
        )
    );

-- Function to get missing translation keys
CREATE OR REPLACE FUNCTION get_missing_translation_keys(
    p_language TEXT,
    p_namespace TEXT
) RETURNS TABLE (key TEXT)
LANGUAGE sql
STABLE
AS $$
    SELECT e.key
    FROM translation_entries e
    WHERE e.language = 'en'
    AND e.namespace = p_namespace
    AND NOT EXISTS (
        SELECT 1 FROM translation_entries t
        WHERE t.language = p_language
        AND t.namespace = p_namespace
        AND t.key = e.key
    );
$$;

-- Function to validate translations
CREATE OR REPLACE FUNCTION validate_translations(
    p_language TEXT,
    p_namespace TEXT
) RETURNS TABLE (
    issue_type TEXT,
    key TEXT,
    message TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    -- Check for missing keys
    RETURN QUERY
    SELECT
        'missing'::TEXT,
        e.key,
        'Missing translation for key'
    FROM get_missing_translation_keys(p_language, p_namespace) e;

    -- Check for duplicate keys
    RETURN QUERY
    SELECT
        'duplicate'::TEXT,
        t.key,
        'Duplicate key: ' || t.key
    FROM translation_entries t
    WHERE t.language = p_language
    AND t.namespace = p_namespace
    GROUP BY t.key
    HAVING COUNT(*) > 1;

    -- Check for excessively long translations
    RETURN QUERY
    SELECT
        'excessively_long'::TEXT,
        t.key,
        'Translation too long: ' || LENGTH(t.value) || ' characters'
    FROM translation_entries t
    WHERE t.language = p_language
    AND t.namespace = p_namespace
    AND LENGTH(t.value) > 500;
END;
$$;
