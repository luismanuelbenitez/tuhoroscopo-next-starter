-- Sprint 4.2: Image metadata columns for RWS card imports
ALTER TABLE tarot_cartas
  ADD COLUMN IF NOT EXISTS imagen_storage_path text,
  ADD COLUMN IF NOT EXISTS imagen_source_url   text,
  ADD COLUMN IF NOT EXISTS imagen_license      text DEFAULT 'public_domain',
  ADD COLUMN IF NOT EXISTS imagen_attribution  text;
