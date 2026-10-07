CREATE TYPE "public"."run_item_status" AS ENUM('judged', 'failed');--> statement-breakpoint
CREATE TABLE "pipeline_run" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"source_id" uuid NOT NULL,
	"pack_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_run_key" UNIQUE("source_id","pack_id")
);
--> statement-breakpoint
CREATE TABLE "pipeline_run_item" (
	"run_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"status" "run_item_status" NOT NULL,
	"error" text,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_run_item_run_id_item_id_pk" PRIMARY KEY("run_id","item_id"),
	CONSTRAINT "pipeline_run_item_error_iff_failed" CHECK (("pipeline_run_item"."status" = 'failed') = ("pipeline_run_item"."error" is not null))
);
--> statement-breakpoint
ALTER TABLE "pipeline_run" ADD CONSTRAINT "pipeline_run_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_run" ADD CONSTRAINT "pipeline_run_pack_id_pack_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."pack"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_run_item" ADD CONSTRAINT "pipeline_run_item_run_id_pipeline_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."pipeline_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_run_item" ADD CONSTRAINT "pipeline_run_item_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE cascade ON UPDATE no action;