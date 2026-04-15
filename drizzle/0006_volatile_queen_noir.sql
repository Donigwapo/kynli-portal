ALTER TABLE `documents` ADD `description` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `docType` varchar(64) DEFAULT 'Other' NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `fileName` varchar(512);--> statement-breakpoint
ALTER TABLE `documents` ADD `fileSize` bigint;