-- 071 — A comment can answer another comment on the same post.
ALTER TABLE community_comments
  ADD COLUMN parent_id UUID REFERENCES community_comments(id) ON DELETE CASCADE;

CREATE INDEX idx_community_comments_parent
  ON community_comments (parent_id, created_at)
  WHERE parent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION community_comments_parent_same_post()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_post uuid;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'comment_parent_self';
  END IF;
  SELECT post_id INTO parent_post
    FROM community_comments
   WHERE id = NEW.parent_id;
  IF parent_post IS NULL OR parent_post <> NEW.post_id THEN
    RAISE EXCEPTION 'comment_parent_post_mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_comments_parent_same_post ON community_comments;
CREATE TRIGGER community_comments_parent_same_post
  BEFORE INSERT OR UPDATE OF parent_id, post_id ON community_comments
  FOR EACH ROW
  EXECUTE FUNCTION community_comments_parent_same_post();
