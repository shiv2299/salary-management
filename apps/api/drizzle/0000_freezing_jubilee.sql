CREATE TABLE `countries` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`currency_code` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `departments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `departments_name_unique` ON `departments` (`name`);--> statement-breakpoint
CREATE TABLE `employees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text NOT NULL,
	`country_code` text NOT NULL,
	`department_id` integer NOT NULL,
	`level_id` integer NOT NULL,
	`job_title` text NOT NULL,
	`hire_date` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`current_amount_minor` integer NOT NULL,
	`current_currency_code` text NOT NULL,
	`current_amount_base_minor` integer NOT NULL,
	`current_effective_date` text NOT NULL,
	`current_reason` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`country_code`) REFERENCES `countries`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`level_id`) REFERENCES `levels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_email_unique` ON `employees` (`email`);--> statement-breakpoint
CREATE INDEX `employees_status_amount_base_idx` ON `employees` (`status`,`current_amount_base_minor`);--> statement-breakpoint
CREATE INDEX `employees_country_level_idx` ON `employees` (`country_code`,`level_id`);--> statement-breakpoint
CREATE INDEX `employees_department_idx` ON `employees` (`department_id`);--> statement-breakpoint
CREATE INDEX `employees_level_idx` ON `employees` (`level_id`);--> statement-breakpoint
CREATE INDEX `employees_name_idx` ON `employees` (`last_name`,`first_name`);--> statement-breakpoint
CREATE TABLE `fx_rates` (
	`currency_code` text NOT NULL,
	`as_of_date` text NOT NULL,
	`rate_to_base_nano` integer NOT NULL,
	PRIMARY KEY(`currency_code`, `as_of_date`)
);
--> statement-breakpoint
CREATE TABLE `levels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`label` text NOT NULL,
	`rank` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `levels_code_unique` ON `levels` (`code`);--> statement-breakpoint
CREATE TABLE `salary_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency_code` text NOT NULL,
	`effective_date` text NOT NULL,
	`reason` text NOT NULL,
	`level_id` integer NOT NULL,
	`country_code` text NOT NULL,
	`batch_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`level_id`) REFERENCES `levels`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`country_code`) REFERENCES `countries`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `salary_revision_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `salary_history_employee_date_idx` ON `salary_history` (`employee_id`,`effective_date`,`id`);--> statement-breakpoint
CREATE INDEX `salary_history_effective_date_idx` ON `salary_history` (`effective_date`);--> statement-breakpoint
CREATE INDEX `salary_history_batch_idx` ON `salary_history` (`batch_id`);--> statement-breakpoint
CREATE TABLE `salary_revision_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`effective_date` text NOT NULL,
	`percentage_bp` integer NOT NULL,
	`employee_count` integer NOT NULL,
	`note` text
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);