drop table if exists prescription_items, prescriptions cascade;
create table prescriptions(id serial primary key,patient_id int not null references patients(id) on delete cascade,doctor_id int references doctors(id),notes text,status text default 'Pending',file_name text,file_data text,created_at timestamptz default now());
create table prescription_items(id serial primary key,prescription_id int not null references prescriptions(id) on delete cascade,medicine_id int references medicines(id),quantity int default 1,dosage text);
