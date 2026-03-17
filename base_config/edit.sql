-- DB sqlite:./squeal.db

select * from connections;

delete from connections where id=5;

update connections set connection_string='sqlite:/home/taylor/.config/squeal/squeal.db' where id=4;
