-- Employees, their attendance and wages. Every user account now belongs to an
-- employee, so each existing user gets one made from its own name, email and store
-- before User.employeeId becomes required.

-- CreateTable
CREATE TABLE `Employee` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `gender` ENUM('MALE', 'FEMALE') NULL,
    `birth_date` DATE NULL,
    `phone` VARCHAR(40) NULL,
    `email` VARCHAR(160) NULL,
    `joined_at` DATE NOT NULL,
    `resign_at` DATE NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `store_id` INTEGER NULL,
    `wage_period` ENUM('DAILY', 'WEEKLY', 'MONTHLY') NOT NULL DEFAULT 'MONTHLY',
    `daily_wage` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `Employee_store_id_idx`(`store_id`),
    INDEX `Employee_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeePhoto` (
    `employee_id` INTEGER NOT NULL,
    `mime_type` VARCHAR(40) NOT NULL,
    `data` MEDIUMBLOB NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`employee_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeAttendance` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `status` ENUM('PRESENT', 'HALF_DAY', 'LEAVE', 'SICK', 'ABSENT') NOT NULL,
    `note` VARCHAR(255) NULL,
    `user_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `EmployeeAttendance_date_idx`(`date`),
    UNIQUE INDEX `EmployeeAttendance_employee_id_date_key`(`employee_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeWage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `period` ENUM('DAILY', 'WEEKLY', 'MONTHLY') NOT NULL,
    `period_start` DATE NOT NULL,
    `period_end` DATE NOT NULL,
    `work_days` DECIMAL(6, 1) NOT NULL,
    `daily_wage` DECIMAL(18, 2) NOT NULL,
    `allowance` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `deduction` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(18, 2) NOT NULL,
    `status` ENUM('UNPAID', 'PAID') NOT NULL DEFAULT 'UNPAID',
    `paid_at` DATETIME(3) NULL,
    `note` VARCHAR(255) NULL,
    `user_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `EmployeeWage_period_start_idx`(`period_start`),
    INDEX `EmployeeWage_status_idx`(`status`),
    UNIQUE INDEX `EmployeeWage_employee_id_period_start_key`(`employee_id`, `period_start`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable: nullable first, so the existing users can be linked before it is required.
ALTER TABLE `User` ADD COLUMN `employeeId` INTEGER NULL;

-- Backfill: one employee per existing user. The email join is one-to-one here because
-- User.email is unique and Employee holds nothing else yet.
INSERT INTO `Employee` (`name`, `email`, `joined_at`, `status`, `store_id`, `updated_at`)
SELECT `name`, `email`, DATE(`createdAt`), IF(`active`, 'ACTIVE', 'INACTIVE'), `storeId`, CURRENT_TIMESTAMP(3)
FROM `User`
ORDER BY `id`;

UPDATE `User` u
JOIN `Employee` e ON e.`email` = u.`email`
SET u.`employeeId` = e.`id`;

ALTER TABLE `User` MODIFY `employeeId` INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_employeeId_key` ON `User`(`employeeId`);

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `Store`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeePhoto` ADD CONSTRAINT `EmployeePhoto_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeAttendance` ADD CONSTRAINT `EmployeeAttendance_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeAttendance` ADD CONSTRAINT `EmployeeAttendance_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeWage` ADD CONSTRAINT `EmployeeWage_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeWage` ADD CONSTRAINT `EmployeeWage_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
