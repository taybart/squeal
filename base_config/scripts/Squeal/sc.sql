-- SQUEAL
select * from sessions;
select * from files where session_id=3;

delete from files where session_id=3 and path like 'term://%';
