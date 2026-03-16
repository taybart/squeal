SELECT * FROM gateways;
SELECT * FROM accounts;

INSERT INTO gateways (created_at, account_id, codename, nickname, uri) 
  VALUES (now(), "5b45bec5-50f7-4b16-b477-3e4a9dc2706e", "test-jig", "Tester", "localhost:18000");
