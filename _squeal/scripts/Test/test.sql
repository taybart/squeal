-- test
INSERT INTO users (name) values ('this guy dude');
SELECT * FROM users where name like '%test%'; 
SELECT * FROM users;
SELECT * FROM connections;
SELECT * FROM messages 
  LIMIT 100;
  SELECT * from messages where content like '%asdf%';
