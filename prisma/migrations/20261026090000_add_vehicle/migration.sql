-- CreateTable
CREATE TABLE `Vehicle` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vehicle_no` VARCHAR(20) NOT NULL,
    `vehicle_type` VARCHAR(60) NOT NULL,
    `driver` VARCHAR(120) NULL,
    `driver_assistance` VARCHAR(120) NULL,
    `min_capacity` DECIMAL(18, 2) NULL,
    `max_capacity` DECIMAL(18, 2) NULL,
    `due_tax` DATE NULL,
    `due_stnk` DATE NULL,
    `due_kir` DATE NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Vehicle_vehicle_no_key`(`vehicle_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
