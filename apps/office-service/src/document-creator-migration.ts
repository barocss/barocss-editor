import type { Migration } from './migrations.js';

/** Existing originals stay Unknown. Attribution never changes tenant authorization. */
export const documentCreatorMigration: Migration = {
  id: '0015_document_creator_attribution',
  sql: `
ALTER TABLE wonffice.documents
  ADD COLUMN creator_user_id uuid REFERENCES wonffice.identities(id) ON DELETE RESTRICT;

CREATE FUNCTION wonffice.enforce_document_creator_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.creator_user_id IS DISTINCT FROM OLD.creator_user_id THEN
    RAISE EXCEPTION 'document_creator_immutable' USING ERRCODE = '23000';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION wonffice.enforce_document_creator_immutable() FROM PUBLIC;
CREATE TRIGGER document_creator_immutable
  BEFORE UPDATE OF creator_user_id ON wonffice.documents
  FOR EACH ROW EXECUTE FUNCTION wonffice.enforce_document_creator_immutable();
`,
};
