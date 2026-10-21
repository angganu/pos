-- AlterTable
ALTER TABLE `StockMovement` MODIFY `type` ENUM('PURCHASE', 'SALE', 'RETURN_IN', 'RETURN_OUT', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'OPENING', 'REJECT') NOT NULL;

-- CreateTable
CREATE TABLE `Reject` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(40) NOT NULL,
    `purchaseId` INTEGER NOT NULL,
    `supplierId` INTEGER NOT NULL,
    `storeId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `total` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `reason` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Reject_code_key`(`code`),
    INDEX `Reject_storeId_date_idx`(`storeId`, `date`),
    INDEX `Reject_supplierId_date_idx`(`supplierId`, `date`),
    INDEX `Reject_purchaseId_idx`(`purchaseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RejectLine` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rejectId` INTEGER NOT NULL,
    `purchaseLineId` INTEGER NOT NULL,
    `itemId` INTEGER NOT NULL,
    `qty` DECIMAL(18, 4) NOT NULL,
    `unitCost` DECIMAL(18, 4) NOT NULL,
    `total` DECIMAL(18, 2) NOT NULL,

    INDEX `RejectLine_rejectId_idx`(`rejectId`),
    INDEX `RejectLine_purchaseLineId_idx`(`purchaseLineId`),
    INDEX `RejectLine_itemId_idx`(`itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Reject` ADD CONSTRAINT `Reject_purchaseId_fkey` FOREIGN KEY (`purchaseId`) REFERENCES `Purchase`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reject` ADD CONSTRAINT `Reject_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reject` ADD CONSTRAINT `Reject_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reject` ADD CONSTRAINT `Reject_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RejectLine` ADD CONSTRAINT `RejectLine_rejectId_fkey` FOREIGN KEY (`rejectId`) REFERENCES `Reject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RejectLine` ADD CONSTRAINT `RejectLine_purchaseLineId_fkey` FOREIGN KEY (`purchaseLineId`) REFERENCES `PurchaseLine`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RejectLine` ADD CONSTRAINT `RejectLine_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `Item`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

