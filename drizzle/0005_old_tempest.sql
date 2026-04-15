CREATE TABLE `category_intelligence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`categoryLabel` varchar(255) NOT NULL,
	`focusArea` varchar(255),
	`ownerName` varchar(255),
	`ownerRole` varchar(255),
	`totalHours` decimal(8,2) DEFAULT '0',
	`percentOfTotal` decimal(6,2) DEFAULT '0',
	`whatItMeans` text,
	`expertTrapRisk` boolean DEFAULT false,
	`delegatable` boolean DEFAULT false,
	`delegateTo` varchar(255),
	`aiRationale` text,
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `category_intelligence_id` PRIMARY KEY(`id`),
	CONSTRAINT `cat_intel_tenant_year_month_cat` UNIQUE(`tenantId`,`year`,`month`,`categoryLabel`)
);
--> statement-breakpoint
ALTER TABLE `task_categories` ADD `description` text;--> statement-breakpoint
ALTER TABLE `task_categories` ADD `ownerName` varchar(255);--> statement-breakpoint
ALTER TABLE `task_categories` ADD `ownerRole` varchar(255);