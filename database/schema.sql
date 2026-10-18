 
CREATE TABLE users (
  user_id        INT AUTO_INCREMENT PRIMARY KEY,
  first_name     VARCHAR(50)  NOT NULL,
  last_name      VARCHAR(50)  NOT NULL,
  name           VARCHAR(101) NOT NULL,              -- full name; the backend writes it (first + last)
  contact        VARCHAR(100) NULL,
  facebook       VARCHAR(150) NULL,
  email          VARCHAR(150) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  role           ENUM('customer','admin') NOT NULL DEFAULT 'customer',
  email_verified TINYINT(1)   NOT NULL DEFAULT 0,    -- 1 after the emailed code is confirmed
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
 
CREATE TABLE products (
  product_id     INT AUTO_INCREMENT PRIMARY KEY,
  product_name   VARCHAR(100) NOT NULL,
  description    TEXT NULL,
  price          DECIMAL(10,2) NOT NULL,
  stock_quantity INT UNSIGNED NOT NULL DEFAULT 0,
  status         ENUM('active','archived') NOT NULL DEFAULT 'active',
  image          MEDIUMTEXT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_product_name (product_name)
) ENGINE=InnoDB;
 
CREATE TABLE orders (
  order_id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id           INT NOT NULL,
  order_date        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  pickup_date       DATE NOT NULL,
  pickup_time       TIME NOT NULL,
  total_amount      DECIMAL(10,2) NOT NULL,
  payment_reference VARCHAR(20) NOT NULL,            -- GCash reference, 10 to 13 digits
  status            ENUM('Pending','Confirmed','Preparing','Ready','Completed','Cancelled') NOT NULL DEFAULT 'Pending',
  cancel_reason     VARCHAR(200) NULL,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  UNIQUE KEY uq_payment_reference (payment_reference),  -- the backend returns 409 on a duplicate
  INDEX idx_orders_status (status),
  INDEX idx_orders_date (order_date)
) ENGINE=InnoDB;
 
CREATE TABLE order_items (
  order_item_id INT AUTO_INCREMENT PRIMARY KEY,
  order_id      INT NOT NULL,
  product_id    INT NOT NULL,
  quantity      INT UNSIGNED NOT NULL,
  price         DECIMAL(10,2) NOT NULL,              -- price of one cookie when the order was placed
  CONSTRAINT fk_items_order   FOREIGN KEY (order_id)   REFERENCES orders(order_id) ON DELETE CASCADE,
  CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products(product_id),
  UNIQUE KEY uq_order_product (order_id, product_id)
) ENGINE=InnoDB;
 
CREATE TABLE notifications (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT NOT NULL,
  order_id        INT NULL,                          -- set for order status messages
  product_id      INT NULL,                          -- set for new / restocked cookie announcements
  message         VARCHAR(255) NOT NULL,
  is_read         TINYINT(1) NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user  FOREIGN KEY (user_id)  REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
  INDEX idx_notif_user (user_id, is_read, created_at)
) ENGINE=InnoDB;
 
CREATE TABLE email_codes (
  code_id    INT AUTO_INCREMENT PRIMARY KEY,
  email      VARCHAR(150) NOT NULL,
  purpose    VARCHAR(20)  NOT NULL,                  -- 'register' or 'reset'
  code_hash  VARCHAR(255) NOT NULL,                  -- hash of the 6-digit code, never the code itself
  attempts   INT NOT NULL DEFAULT 0,                 -- wrong tries
  expires_at DATETIME NOT NULL,
  used       TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email_codes_lookup (email, purpose, used)
) ENGINE=InnoDB;
 