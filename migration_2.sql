alter table users add column if not exists doctor_id int references doctors(id) on delete set null;
