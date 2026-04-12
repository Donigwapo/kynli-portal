ALTER TABLE `documents` ADD `description` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `docType` varchar(64) DEFAULT 'other';