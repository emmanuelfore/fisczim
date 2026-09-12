-- Add detailed HR fields to employees table
ALTER TABLE "employees" ADD COLUMN "title" text;
ALTER TABLE "employees" ADD COLUMN "date_of_birth" date;
ALTER TABLE "employees" ADD COLUMN "gender" text;
ALTER TABLE "employees" ADD COLUMN "marital_status" text;
ALTER TABLE "employees" ADD COLUMN "physical_address" text;
ALTER TABLE "employees" ADD COLUMN "postal_address" text;
ALTER TABLE "employees" ADD COLUMN "next_of_kin_name" text;
ALTER TABLE "employees" ADD COLUMN "next_of_kin_relationship" text;
ALTER TABLE "employees" ADD COLUMN "next_of_kin_phone" text;
ALTER TABLE "employees" ADD COLUMN "next_of_kin_address" text;
