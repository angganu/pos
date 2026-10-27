-- The whole schema in one migration: init, add_reject, add_vehicle, add_delivery and
-- add_purchase_order squashed together. A database that already ran those older
-- migrations must not run this one: bring it up to this schema, then record it with
-- `npx prisma migrate resolve --applied 20261027120000_init`.

-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(160) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `role` ENUM('ADMIN', 'OWNER', 'MANAGER', 'CASHIER') NOT NULL,
    `storeId` INTEGER NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_storeId_idx`(`storeId`),
    INDEX `User_role_idx`(`role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Store` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `address` VARCHAR(255) NULL,
    `phone` VARCHAR(40) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Store_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Customer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `address` VARCHAR(255) NULL,
    `phone` VARCHAR(40) NULL,
    `tier` VARCHAR(40) NOT NULL DEFAULT 'Member',
    `points` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Customer_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Supplier` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `address` VARCHAR(255) NULL,
    `phone` VARCHAR(40) NULL,
    `pic` VARCHAR(120) NULL,
    `terms` VARCHAR(80) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Supplier_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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

-- CreateTable
CREATE TABLE `Category` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Category_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Unit` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Unit_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Item` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(40) NOT NULL,
    `barcode` VARCHAR(60) NULL,
    `name` VARCHAR(180) NOT NULL,
    `description` TEXT NULL,
    `imageUrl` VARCHAR(400) NULL,
    `categoryId` INTEGER NOT NULL,
    `baseUnitId` INTEGER NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Item_code_key`(`code`),
    UNIQUE INDEX `Item_barcode_key`(`barcode`),
    INDEX `Item_categoryId_idx`(`categoryId`),
    INDEX `Item_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ItemUnit` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `itemId` INTEGER NOT NULL,
    `unitId` INTEGER NOT NULL,
    `label` VARCHAR(80) NOT NULL,
    `factor` DECIMAL(18, 4) NOT NULL,
    `isBase` BOOLEAN NOT NULL DEFAULT false,
    `isBuying` BOOLEAN NOT NULL DEFAULT true,

    INDEX `ItemUnit_itemId_idx`(`itemId`),
    UNIQUE INDEX `ItemUnit_itemId_label_key`(`itemId`, `label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ItemStock` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `itemId` INTEGER NOT NULL,
    `storeId` INTEGER NOT NULL,
    `stock` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `minStock` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ItemStock_storeId_idx`(`storeId`),
    UNIQUE INDEX `ItemStock_itemId_storeId_key`(`itemId`, `storeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ItemPrice` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `itemId` INTEGER NOT NULL,
    `storeId` INTEGER NOT NULL,
    `customerId` INTEGER NULL,
    `price` DECIMAL(18, 4) NOT NULL,
    `effectiveFrom` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ItemPrice_storeId_idx`(`storeId`),
    INDEX `ItemPrice_customerId_idx`(`customerId`),
    UNIQUE INDEX `ItemPrice_itemId_storeId_customerId_key`(`itemId`, `storeId`, `customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Purchase` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(40) NOT NULL,
    `supplierId` INTEGER NOT NULL,
    `storeId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `subtotal` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `discount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `tax` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `status` ENUM('DRAFT', 'POSTED', 'VOID') NOT NULL DEFAULT 'POSTED',
    `note` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Purchase_code_key`(`code`),
    INDEX `Purchase_storeId_date_idx`(`storeId`, `date`),
    INDEX `Purchase_supplierId_idx`(`supplierId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PurchaseLine` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `purchaseId` INTEGER NOT NULL,
    `itemId` INTEGER NOT NULL,
    `unitLabel` VARCHAR(80) NOT NULL,
    `factor` DECIMAL(18, 4) NOT NULL,
    `qty` DECIMAL(18, 4) NOT NULL,
    `baseQty` DECIMAL(18, 4) NOT NULL,
    `pricePerUnit` DECIMAL(18, 4) NOT NULL,
    `pricePerBase` DECIMAL(18, 4) NOT NULL,
    `discount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(18, 2) NOT NULL,

    INDEX `PurchaseLine_purchaseId_idx`(`purchaseId`),
    INDEX `PurchaseLine_itemId_idx`(`itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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

-- CreateTable
CREATE TABLE `Order` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(40) NOT NULL,
    `storeId` INTEGER NOT NULL,
    `customerId` INTEGER NULL,
    `userId` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `subtotal` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `discount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `tax` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `status` ENUM('UNPAID', 'PAID', 'VOID') NOT NULL DEFAULT 'UNPAID',
    `is_delivered` BOOLEAN NOT NULL DEFAULT false,
    `deliveryNoteId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Order_code_key`(`code`),
    INDEX `Order_storeId_date_idx`(`storeId`, `date`),
    INDEX `Order_customerId_idx`(`customerId`),
    INDEX `Order_storeId_status_is_delivered_idx`(`storeId`, `status`, `is_delivered`),
    INDEX `Order_deliveryNoteId_idx`(`deliveryNoteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `itemId` INTEGER NOT NULL,
    `qty` DECIMAL(18, 4) NOT NULL,
    `unitPrice` DECIMAL(18, 4) NOT NULL,
    `basePrice` DECIMAL(18, 4) NOT NULL,
    `discount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(18, 2) NOT NULL,
    `isMember` BOOLEAN NOT NULL DEFAULT false,

    INDEX `OrderItem_orderId_idx`(`orderId`),
    INDEX `OrderItem_itemId_idx`(`itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Sale` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(40) NOT NULL,
    `orderId` INTEGER NULL,
    `storeId` INTEGER NOT NULL,
    `customerId` INTEGER NULL,
    `userId` INTEGER NOT NULL,
    `shiftId` INTEGER NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `subtotal` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `discount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `tax` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `cogs` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `paid` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `change` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `paymentMethod` ENUM('CASH', 'QRIS', 'CARD', 'SPLIT') NOT NULL DEFAULT 'CASH',
    `paymentMeta` JSON NULL,
    `pointsEarned` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('DRAFT', 'POSTED', 'VOID') NOT NULL DEFAULT 'POSTED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Sale_code_key`(`code`),
    UNIQUE INDEX `Sale_orderId_key`(`orderId`),
    INDEX `Sale_storeId_date_idx`(`storeId`, `date`),
    INDEX `Sale_customerId_idx`(`customerId`),
    INDEX `Sale_shiftId_idx`(`shiftId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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

-- CreateTable
CREATE TABLE `SaleLine` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `saleId` INTEGER NOT NULL,
    `itemId` INTEGER NOT NULL,
    `qty` DECIMAL(18, 4) NOT NULL,
    `unitPrice` DECIMAL(18, 4) NOT NULL,
    `basePrice` DECIMAL(18, 4) NOT NULL,
    `unitCost` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `discount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(18, 2) NOT NULL,
    `isMember` BOOLEAN NOT NULL DEFAULT false,

    INDEX `SaleLine_saleId_idx`(`saleId`),
    INDEX `SaleLine_itemId_idx`(`itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReturnDoc` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(40) NOT NULL,
    `type` ENUM('SALE', 'PURCHASE') NOT NULL,
    `storeId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `saleId` INTEGER NULL,
    `supplierId` INTEGER NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `total` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `reason` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ReturnDoc_code_key`(`code`),
    INDEX `ReturnDoc_storeId_date_idx`(`storeId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReturnLine` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `returnId` INTEGER NOT NULL,
    `itemId` INTEGER NOT NULL,
    `qty` DECIMAL(18, 4) NOT NULL,
    `price` DECIMAL(18, 4) NOT NULL,
    `total` DECIMAL(18, 2) NOT NULL,

    INDEX `ReturnLine_returnId_idx`(`returnId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Transfer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(40) NOT NULL,
    `fromStoreId` INTEGER NOT NULL,
    `toStoreId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` ENUM('DRAFT', 'SENT', 'RECEIVED', 'CANCELLED') NOT NULL DEFAULT 'SENT',
    `note` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Transfer_code_key`(`code`),
    INDEX `Transfer_fromStoreId_idx`(`fromStoreId`),
    INDEX `Transfer_toStoreId_idx`(`toStoreId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TransferLine` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `transferId` INTEGER NOT NULL,
    `itemId` INTEGER NOT NULL,
    `qty` DECIMAL(18, 4) NOT NULL,

    INDEX `TransferLine_transferId_idx`(`transferId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockOpname` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(40) NOT NULL,
    `storeId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` ENUM('DRAFT', 'POSTED', 'VOID') NOT NULL DEFAULT 'DRAFT',
    `note` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StockOpname_code_key`(`code`),
    INDEX `StockOpname_storeId_date_idx`(`storeId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OpnameLine` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `opnameId` INTEGER NOT NULL,
    `itemId` INTEGER NOT NULL,
    `systemQty` DECIMAL(18, 4) NOT NULL,
    `physicalQty` DECIMAL(18, 4) NOT NULL,
    `diff` DECIMAL(18, 4) NOT NULL,
    `value` DECIMAL(18, 2) NOT NULL DEFAULT 0,

    INDEX `OpnameLine_opnameId_idx`(`opnameId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockMovement` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `itemId` INTEGER NOT NULL,
    `storeId` INTEGER NOT NULL,
    `userId` INTEGER NULL,
    `type` ENUM('PURCHASE', 'SALE', 'RETURN_IN', 'RETURN_OUT', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'OPENING', 'REJECT') NOT NULL,
    `qty` DECIMAL(18, 4) NOT NULL,
    `balanceAfter` DECIMAL(18, 4) NOT NULL,
    `unitCost` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `refType` VARCHAR(40) NULL,
    `refId` INTEGER NULL,
    `note` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StockMovement_itemId_storeId_createdAt_idx`(`itemId`, `storeId`, `createdAt`),
    INDEX `StockMovement_storeId_createdAt_idx`(`storeId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Shift` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(40) NOT NULL,
    `storeId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,
    `openingCash` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `closingCash` DECIMAL(18, 2) NULL,
    `expectedCash` DECIMAL(18, 2) NULL,
    `difference` DECIMAL(18, 2) NULL,
    `note` VARCHAR(255) NULL,

    UNIQUE INDEX `Shift_code_key`(`code`),
    INDEX `Shift_storeId_openedAt_idx`(`storeId`, `openedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HeldSale` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `label` VARCHAR(120) NOT NULL,
    `storeId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `customerId` INTEGER NULL,
    `total` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `payload` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `HeldSale_storeId_idx`(`storeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Setting` (
    `key` VARCHAR(80) NOT NULL,
    `value` TEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NULL,
    `action` VARCHAR(80) NOT NULL,
    `entity` VARCHAR(80) NOT NULL,
    `entityId` VARCHAR(80) NULL,
    `meta` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_entity_entityId_idx`(`entity`, `entityId`),
    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Item` ADD CONSTRAINT `Item_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Item` ADD CONSTRAINT `Item_baseUnitId_fkey` FOREIGN KEY (`baseUnitId`) REFERENCES `Unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItemUnit` ADD CONSTRAINT `ItemUnit_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `Item`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItemUnit` ADD CONSTRAINT `ItemUnit_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItemStock` ADD CONSTRAINT `ItemStock_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `Item`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItemStock` ADD CONSTRAINT `ItemStock_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItemPrice` ADD CONSTRAINT `ItemPrice_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `Item`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItemPrice` ADD CONSTRAINT `ItemPrice_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItemPrice` ADD CONSTRAINT `ItemPrice_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Purchase` ADD CONSTRAINT `Purchase_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Purchase` ADD CONSTRAINT `Purchase_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Purchase` ADD CONSTRAINT `Purchase_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseLine` ADD CONSTRAINT `PurchaseLine_purchaseId_fkey` FOREIGN KEY (`purchaseId`) REFERENCES `Purchase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseLine` ADD CONSTRAINT `PurchaseLine_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `Item`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_deliveryNoteId_fkey` FOREIGN KEY (`deliveryNoteId`) REFERENCES `DeliveryNote`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `Item`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sale` ADD CONSTRAINT `Sale_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sale` ADD CONSTRAINT `Sale_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sale` ADD CONSTRAINT `Sale_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sale` ADD CONSTRAINT `Sale_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sale` ADD CONSTRAINT `Sale_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `Shift`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE `SaleLine` ADD CONSTRAINT `SaleLine_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `Sale`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleLine` ADD CONSTRAINT `SaleLine_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `Item`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReturnDoc` ADD CONSTRAINT `ReturnDoc_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReturnDoc` ADD CONSTRAINT `ReturnDoc_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReturnDoc` ADD CONSTRAINT `ReturnDoc_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `Sale`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReturnDoc` ADD CONSTRAINT `ReturnDoc_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReturnLine` ADD CONSTRAINT `ReturnLine_returnId_fkey` FOREIGN KEY (`returnId`) REFERENCES `ReturnDoc`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReturnLine` ADD CONSTRAINT `ReturnLine_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `Item`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transfer` ADD CONSTRAINT `Transfer_fromStoreId_fkey` FOREIGN KEY (`fromStoreId`) REFERENCES `Store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transfer` ADD CONSTRAINT `Transfer_toStoreId_fkey` FOREIGN KEY (`toStoreId`) REFERENCES `Store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transfer` ADD CONSTRAINT `Transfer_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransferLine` ADD CONSTRAINT `TransferLine_transferId_fkey` FOREIGN KEY (`transferId`) REFERENCES `Transfer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransferLine` ADD CONSTRAINT `TransferLine_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `Item`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockOpname` ADD CONSTRAINT `StockOpname_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockOpname` ADD CONSTRAINT `StockOpname_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OpnameLine` ADD CONSTRAINT `OpnameLine_opnameId_fkey` FOREIGN KEY (`opnameId`) REFERENCES `StockOpname`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OpnameLine` ADD CONSTRAINT `OpnameLine_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `Item`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `Item`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Shift` ADD CONSTRAINT `Shift_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Shift` ADD CONSTRAINT `Shift_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HeldSale` ADD CONSTRAINT `HeldSale_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HeldSale` ADD CONSTRAINT `HeldSale_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HeldSale` ADD CONSTRAINT `HeldSale_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

