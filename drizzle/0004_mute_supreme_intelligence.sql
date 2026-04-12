CREATE TABLE `client_roster` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`clientName` varchar(255) NOT NULL,
	`packageTier` enum('legacy','momentum','growth_1','growth_2','cfo') NOT NULL,
	`monthlyFee` decimal(15,2) NOT NULL DEFAULT '0',
	`signedAt` timestamp NOT NULL,
	`status` enum('active','churned') NOT NULL DEFAULT 'active',
	`totalIncome` decimal(15,2) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_roster_id` PRIMARY KEY(`id`)
);
