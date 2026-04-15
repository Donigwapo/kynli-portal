CREATE TABLE `focus_areas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`label` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `focus_areas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `team_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `time_logs` ADD `logDate` varchar(10);--> statement-breakpoint
ALTER TABLE `time_logs` ADD `teamMember` varchar(255);--> statement-breakpoint
ALTER TABLE `time_logs` ADD `taskCategory` varchar(255);--> statement-breakpoint
ALTER TABLE `time_logs` ADD `minutes` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `time_logs` ADD `notes` text;