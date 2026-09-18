-- 0061 — Buddy remembers how it routed an answer
--
-- The orchestrator (src/lib/ai/orchestrator.ts) decides, for every question Buddy is asked without
-- a quick action, what the person is actually trying to do — and from that which persona answers,
-- which mode's instructions apply and how much thinking the answer is worth.
--
-- That decision has to be recorded, for two reasons. An answer that went wrong is almost always an
-- answer that was *routed* wrong, and without the decision on the row there is no way to tell a bad
-- answer from a good answer to the wrong question. And the Buddy Intelligence Console (a later
-- stage) reports on exactly this: which intents arrive, which ones the rules cannot settle, which
-- ones come back with low confidence.
--
-- One nullable column. Every existing row keeps its meaning — no routing recorded simply means the
-- answer predates this, which is also what an older client sending no routing looks like.

alter table ai_messages add column if not exists routing jsonb;

comment on column ai_messages.routing is
  'Orchestrator decision for this answer: {intent, mode, assistant, source, confidence, signals}. '
  'source explicit_mode = the person pressed a quick action, rules = the keyword/context pass, '
  'model = the classifier was consulted, fallback = nothing matched. Null for answers written '
  'before the orchestrator existed. Diagnostic only — nothing in the product reads it to decide '
  'anything, so a wrong value can never widen access.';

-- Intent is what the console groups by, and it is read out of a jsonb column on a table that grows
-- with every message. One expression index keeps that cheap; nothing else about the table changes.
create index if not exists ai_messages_routing_intent_idx
  on ai_messages ((routing ->> 'intent'))
  where routing is not null;
