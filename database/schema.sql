CREATE TABLE users (
  user_id       INT AUTO_INCREMENT PRIMARY KEY,
  first_name    VARCHAR(50) NOT NULL,
  last_name     VARCHAR(50) NOT NULL,
  name          VARCHAR(101) AS (CONCAT(first_name, ' ', last_name)) VIRTUAL,
  contact       VARCHAR(100) NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('customer','admin') NOT NULL DEFAULT 'customer',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  order_id      INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  order_date    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  pickup_date   DATE NOT NULL,
  pickup_time   TIME NOT NULL,
  total_amount  DECIMAL(10,2) NOT NULL,
  status        ENUM('Pending','Confirmed','Preparing','Ready','Completed','Cancelled') NOT NULL DEFAULT 'Pending',
  cancel_reason VARCHAR(200) NULL,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  INDEX idx_orders_status (status),
  INDEX idx_orders_date (order_date)
) ENGINE=InnoDB;

CREATE TABLE order_items (
  order_item_id INT AUTO_INCREMENT PRIMARY KEY,
  order_id      INT NOT NULL,
  product_id    INT NOT NULL,
  quantity      INT UNSIGNED NOT NULL,
  price         DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
  CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products(product_id),
  UNIQUE KEY uq_order_product (order_id, product_id)
) ENGINE=InnoDB;

CREATE TABLE notifications (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  order_id   INT NULL,
  message    VARCHAR(255) NOT NULL,
  is_read    TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user  FOREIGN KEY (user_id)  REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
  INDEX idx_notif_user (user_id, is_read, created_at)
) ENGINE=InnoDB;