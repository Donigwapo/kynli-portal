CREATE TABLE `ai_summaries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`content` text NOT NULL,
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_summaries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `coaching_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`quarter` varchar(10) NOT NULL,
	`title` varchar(512) NOT NULL,
	`notes` text,
	`isCompleted` boolean NOT NULL DEFAULT false,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `coaching_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`fileUrl` text NOT NULL,
	`mimeType` varchar(128),
	`year` int NOT NULL,
	`uploadedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `financials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`revenue` decimal(15,2) DEFAULT '0',
	`expenses` decimal(15,2) DEFAULT '0',
	`netProfit` decimal(15,2) DEFAULT '0',
	`margin` decimal(6,2) DEFAULT '0',
	`budgetRevenue` decimal(15,2) DEFAULT '0',
	`budgetExpenses` decimal(15,2) DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `financials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kpi_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`cac` decimal(15,2),
	`churnRate` decimal(6,2),
	`ltv` decimal(15,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kpi_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `line_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`type` enum('income','expense') NOT NULL,
	`label` varchar(255) NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `line_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_tracker` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`goalClients` int NOT NULL DEFAULT 0,
	`signedClients` int NOT NULL DEFAULT 0,
	`referralCount` int NOT NULL DEFAULT 0,
	`outboundCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sales_tracker_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`companyName` varchar(255),
	`contactName` varchar(255),
	`email` varchar(320),
	`packageTier` enum('legacy','momentum','growth_1','growth_2','cfo') NOT NULL DEFAULT 'legacy',
	`isActive` boolean NOT NULL DEFAULT true,
	`signedAt` timestamp NOT NULL DEFAULT (now()),
	`ghlNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `time_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`focusArea` varchar(128) NOT NULL,
	`hours` decimal(8,2) NOT NULL,
	`delegationSuggestion` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `time_logs_id` PRIMARY KEY(`id`)
);
