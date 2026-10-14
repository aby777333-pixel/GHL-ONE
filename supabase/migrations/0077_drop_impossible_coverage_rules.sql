-- 0077_drop_impossible_coverage_rules.sql
--
-- Thirteen coverage_requirements asked for one person on duty in a department with no active
-- people at all (see 0076 for the alert storm they caused). A rule nobody can meet is not a
-- rule; it is noise on the Coverage tab and in every forecast. Removed by condition, not by id,
-- so the same statement is safe to re-run: it only ever removes a department-level requirement
-- whose minimum exceeds the department's active headcount. The three feasible rules (Design,
-- HR & Recruitment, Management) are untouched.
delete from coverage_requirements cr
 using departments d
 where d.id = cr.department_id and cr.team_id is null
   and cr.min_people > (select count(*) from profiles p where p.department_id = d.id and p.is_active);
