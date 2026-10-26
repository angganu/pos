-- AlterTable
ALTER TABLE `Sale` ADD COLUMN `deliveryNoteId` INTEGER NULL,
    ADD COLUMN `is_delivered` BOOLEAN NOT NULL DEFAULT false;

-- Sales made before deliveries were tracked count as delivered, so the
-- pengiriman screen starts with only new sales waiting.
UPDATE `Sale` SET `is_delivered` = true;

-- CreateTable
CREATE TABLE `Delivery` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(40) NOT NULL,
    `storeId` INTEGER NOT NULL,
    `vehicleId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `driver` VARCHAR(120) NULL,
    `driverAssistance` VARCHAR(120) NULL,
    `note` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Delivery_code_key`(`code`),
    INDEX `Delivery_storeId_date_idx`(`storeId`, `date`),
    INDEX `Delivery_vehicleId_idx`(`vehicleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeliveryNote` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(40) NOT NULL,
    `deliveryId` INTEGER NOT NULL,
    `customerId` INTEGER NULL,

    UNIQUE INDEX `DeliveryNote_code_key`(`code`),
    INDEX `DeliveryNote_deliveryId_idx`(`deliveryId`),
    INDEX `DeliveryNote_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Sale_storeId_is_delivered_idx` ON `Sale`(`storeId`, `is_delivered`);

-- CreateIndex
CREATE INDEX `Sale_deliveryNoteId_idx` ON `Sale`(`deliveryNoteId`);

-- AddForeignKey
ALTER TABLE `Sale` ADD CONSTRAINT `Sale_deliveryNoteId_fkey` FOREIGN KEY (`deliveryNoteId`) REFERENCES `DeliveryNote`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Delivery` ADD CONSTRAINT `Delivery_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Delivery` ADD CONSTRAINT `Delivery_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Delivery` ADD CONSTRAINT `Delivery_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeliveryNote` ADD CONSTRAINT `DeliveryNote_deliveryId_fkey` FOREIGN KEY (`deliveryId`) REFERENCES `Delivery`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeliveryNote` ADD CONSTRAINT `DeliveryNote_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
