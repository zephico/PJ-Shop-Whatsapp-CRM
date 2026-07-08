-- ============================================================
-- message_templates: catalog / multi-product template metadata
-- ============================================================

ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS template_format TEXT,
  ADD COLUMN IF NOT EXISTS catalog_id TEXT,
  ADD COLUMN IF NOT EXISTS product_retailer_ids JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'message_templates_template_format_check'
      AND conrelid = 'message_templates'::regclass
  ) THEN
    ALTER TABLE message_templates
      ADD CONSTRAINT message_templates_template_format_check
      CHECK (
        template_format IS NULL
        OR template_format IN (
          'text',
          'image',
          'video',
          'document',
          'catalog',
          'multi_product'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'message_templates_product_retailer_ids_shape_check'
      AND conrelid = 'message_templates'::regclass
  ) THEN
    ALTER TABLE message_templates
      ADD CONSTRAINT message_templates_product_retailer_ids_shape_check
      CHECK (
        product_retailer_ids IS NULL
        OR jsonb_typeof(product_retailer_ids) = 'array'
      );
  END IF;
END $$;

UPDATE message_templates
SET template_format = CASE
  WHEN buttons IS NOT NULL AND lower(buttons::text) LIKE '%"type": "mpm"%'
    THEN 'multi_product'
  WHEN buttons IS NOT NULL AND lower(buttons::text) LIKE '%"type": "catalog"%'
    THEN 'catalog'
  WHEN header_type = 'image' THEN 'image'
  WHEN header_type = 'video' THEN 'video'
  WHEN header_type = 'document' THEN 'document'
  ELSE 'text'
END
WHERE template_format IS NULL;
