CREATE TABLE IF NOT EXISTS users (
 id INT PRIMARY KEY AUTO_INCREMENT,
 username VARCHAR(80) NOT NULL UNIQUE,
 display_name VARCHAR(80) NOT NULL,
 password_hash VARCHAR(200) NOT NULL,
 role ENUM('student','admin') NOT NULL DEFAULT 'student'
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash CHAR(64) PRIMARY KEY,
 user_id INT NOT NULL,
 expires_at DATETIME NOT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 INDEX (expires_at)
);
CREATE TABLE IF NOT EXISTS rooms (
 id INT PRIMARY KEY AUTO_INCREMENT,
 name VARCHAR(100) NOT NULL,
 location VARCHAR(100) NOT NULL,
 school_area VARCHAR(24) UNIQUE,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 note VARCHAR(300) NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS school_connections (
 user_id INT PRIMARY KEY,
 identity_hash CHAR(64) NOT NULL UNIQUE,
 encrypted_state MEDIUMTEXT NOT NULL,
 valid_until DATETIME NOT NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS school_requests (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 user_id INT NOT NULL,
 request_key CHAR(36) NOT NULL,
 fingerprint CHAR(64) NOT NULL,
 external_id VARCHAR(80),
 operation ENUM('create','cancel') NOT NULL DEFAULT 'create',
 status ENUM('sending','saved','submitted','confirmed','cancelled','unknown','failed') NOT NULL DEFAULT 'sending',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE(user_id,request_key),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS school_booking_records (
 id INT PRIMARY KEY AUTO_INCREMENT,
 user_id INT NOT NULL,
 room_code VARCHAR(20) NOT NULL,
 request_id BIGINT UNIQUE,
 use_date DATE NOT NULL,
 start_time TIME NOT NULL,
 end_time TIME NOT NULL,
 attendee_count TINYINT UNSIGNED NOT NULL,
 encrypted_form TEXT NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY (request_id) REFERENCES school_requests(id) ON DELETE CASCADE,
 INDEX (user_id, id),
 INDEX (user_id, room_code, id),
 INDEX booking_date (use_date, request_id, id),
 CONSTRAINT booking_time_range CHECK (start_time >= '00:00:00' AND end_time < '24:00:00' AND end_time > start_time),
 CONSTRAINT booking_attendee_count CHECK (attendee_count <= 99)
);
