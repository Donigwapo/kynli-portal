CREATE TABLE `chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`senderUserId` int,
	`senderName` varchar(255) NOT NULL,
	`senderRole` enum('admin','client') NOT NULL DEFAULT 'client',
	`body` text,
	`fileKey` varchar(512),
	`fileUrl` text,
	`fileName` varchar(512),
	`fileSize` bigint,
	`mimeType` varchar(128),
	`archiveYear` int,
	`archiveMonth` int,
	`portalDocumentId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
