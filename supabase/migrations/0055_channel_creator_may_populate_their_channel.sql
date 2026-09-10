-- 0055 — creating a channel with members left it empty.
--
-- Reported as: pick a person under Members, the modal says "1 selected · you are added
-- automatically", press Create channel, and the channel opens with "0 members · 1 online" and the
-- person missing.
--
-- Reproduced as an ordinary employee: the whole `channel_members` insert is refused by RLS.
--
-- `channels.visibility` defaults to `invite_only`, and `cm_insert` checked
-- `can_view_channel(channel_id) OR user_id = auth.uid()`. At the moment the members are written the
-- creator is not a member yet — that is the very row being inserted — so `can_view_channel` is
-- false for them. Their own row passes on the second branch, but the row for anybody else does not,
-- and one failing row fails the whole statement. So the creator was not added either: 0 members.
--
-- It only worked for administrators, because `can_view_channel` has a
-- `has_admin_perm('communication.manage')` branch. Anyone testing as an admin would never see it.
--
-- The fix belongs here rather than in the modal: the client could paper over it by inserting rows
-- one at a time and swallowing the failures, which would produce a channel silently missing the
-- people it was told to include. The person who created a channel may put people in it — that is
-- what creating it means.
--
-- Verified as an ordinary employee: creator + selected member both land (2 members), and someone
-- with nothing to do with the channel is still refused when they try to add a third party.
drop policy if exists cm_insert on public.channel_members;
create policy cm_insert on public.channel_members for insert with check (
  can_view_channel(channel_id)
  or user_id = auth.uid()
  or exists (
    select 1 from channels c
     where c.id = channel_members.channel_id
       and c.org_id = current_org()
       and (c.created_by = auth.uid() or c.owner_id = auth.uid() or c.co_owner_id = auth.uid())
  )
);
