ALTER TABLE `ai_summaries` ADD CONSTRAINT `ai_summary_tenant_year_month` UNIQUE(`tenantId`,`year`,`month`);--> statement-breakpoint
ALTER TABLE `financials` ADD CONSTRAINT `financials_tenant_year_month` UNIQUE(`tenantId`,`year`,`month`);--> statement-breakpoint
ALTER TABLE `kpi_metrics` ADD CONSTRAINT `kpi_tenant_year_month` UNIQUE(`tenantId`,`year`,`month`);--> statement-breakpoint
ALTER TABLE `sales_tracker` ADD CONSTRAINT `sales_tenant_year_month` UNIQUE(`tenantId`,`year`,`month`);--> statement-breakpoint
ALTER TABLE `tenants` ADD CONSTRAINT `tenants_userId_unique` UNIQUE(`userId`);