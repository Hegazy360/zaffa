-- Chat widget transcripts (ZAF-80). Additive; RLS enabled with no
-- policies (Prisma connects as postgres and bypasses RLS; enabling it
-- keeps the Supabase security advisors quiet, matching the enquiries
-- tables' convention).
CREATE TABLE IF NOT EXISTS chat_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  locale          varchar(5),
  country         varchar(2),
  message_count   integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role            text NOT NULL,
  content         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_conversation_id_created_at_idx
  ON chat_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS chat_conversations_last_message_at_idx
  ON chat_conversations (last_message_at);
CREATE INDEX IF NOT EXISTS chat_conversations_user_id_idx
  ON chat_conversations (user_id);

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Align FK actions with what Prisma emits (ON UPDATE CASCADE), so these
-- tables disappear from `prisma migrate diff` instead of reading as drift.
ALTER TABLE chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_user_id_fkey;
ALTER TABLE chat_conversations ADD CONSTRAINT chat_conversations_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_conversation_id_fkey;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_conversation_id_fkey
  FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE ON UPDATE CASCADE;
