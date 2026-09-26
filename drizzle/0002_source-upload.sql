ALTER TABLE "source" ALTER COLUMN "field_mapping" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "source" ALTER COLUMN "field_mapping" DROP NOT NULL;--> statement-breakpoint
UPDATE "source" SET "field_mapping" = NULL WHERE "field_mapping" = '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "item" ADD COLUMN "account_ref" text;--> statement-breakpoint
ALTER TABLE "source" ADD COLUMN "shape" text;--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_shape_key" UNIQUE("workspace_id","shape");