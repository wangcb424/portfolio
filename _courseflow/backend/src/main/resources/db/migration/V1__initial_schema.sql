CREATE TABLE courses (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  credits INTEGER NOT NULL CHECK (credits >= 0)
);
CREATE TABLE prerequisites (
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  prerequisite_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  PRIMARY KEY(course_id, prerequisite_id),
  CHECK(course_id <> prerequisite_id)
);
CREATE TABLE sections (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  crn VARCHAR(20) NOT NULL UNIQUE,
  term VARCHAR(30) NOT NULL,
  instructor VARCHAR(120) NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity >= 0),
  available_seats INTEGER NOT NULL CHECK (available_seats >= 0 AND available_seats <= capacity),
  seats_checked_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE meetings (
  id BIGSERIAL PRIMARY KEY,
  section_id BIGINT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  day_of_week VARCHAR(9) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  CHECK(start_time < end_time)
);
CREATE INDEX idx_sections_course ON sections(course_id);
CREATE INDEX idx_sections_term ON sections(term);

INSERT INTO courses(code,title,description,credits) VALUES
('CS2100','Program Design and Implementation 1','Foundations of data-oriented and object-oriented program design.',4),
('CS3000','Algorithms and Data','Design, analysis, correctness, and implementation of efficient algorithms.',4),
('CS3100','Program Design and Implementation 2','Program design at increasing scales of complexity.',4),
('CS3200','Introduction to Databases','Relational modeling, SQL, indexing, transactions, and database applications.',4);

INSERT INTO prerequisites(course_id, prerequisite_id) VALUES
((SELECT id FROM courses WHERE code='CS3100'), (SELECT id FROM courses WHERE code='CS2100'));

-- Synthetic sections used for local development. They are not live Banner data.
INSERT INTO sections(course_id,crn,term,instructor,capacity,available_seats,seats_checked_at) VALUES
((SELECT id FROM courses WHERE code='CS3000'),'DEMO-10001','Fall 2026','Demo Instructor A',100,8,NOW()),
((SELECT id FROM courses WHERE code='CS3000'),'DEMO-10002','Fall 2026','Demo Instructor B',100,0,NOW()),
((SELECT id FROM courses WHERE code='CS3100'),'DEMO-11001','Fall 2026','Demo Instructor C',100,6,NOW()),
((SELECT id FROM courses WHERE code='CS3100'),'DEMO-11002','Fall 2026','Demo Instructor D',100,0,NOW()),
((SELECT id FROM courses WHERE code='CS3200'),'DEMO-12001','Fall 2026','Demo Instructor E',80,12,NOW());
INSERT INTO meetings(section_id,day_of_week,start_time,end_time) VALUES
((SELECT id FROM sections WHERE crn='DEMO-10001'),'MONDAY','10:30','11:35'),
((SELECT id FROM sections WHERE crn='DEMO-10001'),'WEDNESDAY','10:30','11:35'),
((SELECT id FROM sections WHERE crn='DEMO-10002'),'TUESDAY','08:00','09:40'),
((SELECT id FROM sections WHERE crn='DEMO-10002'),'THURSDAY','08:00','09:40'),
((SELECT id FROM sections WHERE crn='DEMO-11001'),'MONDAY','13:35','15:15'),
((SELECT id FROM sections WHERE crn='DEMO-11001'),'WEDNESDAY','13:35','15:15'),
((SELECT id FROM sections WHERE crn='DEMO-11002'),'FRIDAY','10:30','13:50'),
((SELECT id FROM sections WHERE crn='DEMO-12001'),'TUESDAY','10:30','12:10'),
((SELECT id FROM sections WHERE crn='DEMO-12001'),'FRIDAY','10:30','12:10');
