CREATE TYPE "public"."item_kind" AS ENUM('ticket', 'call', 'survey_response', 'review', 'interview');--> statement-breakpoint
CREATE TYPE "public"."judge_backend" AS ENUM('recorded', 'jev', 'llm');--> statement-breakpoint
CREATE TYPE "public"."link_target" AS ENUM('issue', 'project');--> statement-breakpoint
CREATE TYPE "public"."opportunity_kind" AS ENUM('outcome', 'problem', 'solution');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('upload');--> statement-breakpoint
CREATE TYPE "public"."speaker_role" AS ENUM('end_user', 'admin', 'buyer', 'executive', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."tracker" AS ENUM('linear');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"arr" bigint NOT NULL,
	"plan" text,
	"segment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_external_key" UNIQUE("workspace_id","external_id"),
	CONSTRAINT "account_arr_nonnegative" CHECK ("account"."arr" >= 0)
);
--> statement-breakpoint
CREATE TABLE "item" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"body" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"account_id" uuid,
	"author_role" "speaker_role",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_external_key" UNIQUE("source_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "judge_answer" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"pack_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"question_key" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"value" jsonb NOT NULL,
	"probabilities" jsonb NOT NULL,
	"confidence" real NOT NULL,
	"backend" "judge_backend" NOT NULL,
	"model_version" text NOT NULL,
	"asked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "judge_answer_key" UNIQUE("pack_id","item_id","question_key","subject"),
	CONSTRAINT "judge_answer_model_pinned" CHECK ("judge_answer"."model_version" ~ '^[a-z][a-z0-9-]*-[0-9]+\.[0-9]+\.[0-9]+$'),
	CONSTRAINT "judge_answer_confidence_unit" CHECK ("judge_answer"."confidence" >= 0 and "judge_answer"."confidence" <= 1)
);
--> statement-breakpoint
CREATE TABLE "link" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"tracker" "tracker" NOT NULL,
	"target" "link_target" NOT NULL,
	"external_id" text NOT NULL,
	"identifier" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "link_key" UNIQUE("opportunity_id","tracker","external_id")
);
--> statement-breakpoint
CREATE TABLE "mention" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"pack_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"ordinal" smallint NOT NULL,
	"sentence_start" smallint NOT NULL,
	"sentence_end" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mention_key" UNIQUE("pack_id","item_id","ordinal"),
	CONSTRAINT "mention_span_ordered" CHECK ("mention"."sentence_start" <= "mention"."sentence_end")
);
--> statement-breakpoint
CREATE TABLE "opportunity" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "opportunity_kind" NOT NULL,
	"parent_id" uuid,
	"parent_kind" "opportunity_kind",
	"title" text NOT NULL,
	"description" text,
	"owner" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_id_kind_workspace_key" UNIQUE("id","kind","workspace_id"),
	CONSTRAINT "opportunity_tree_shape" CHECK (("opportunity"."kind" = 'outcome' and "opportunity"."parent_id" is null and "opportunity"."parent_kind" is null) or ("opportunity"."kind" = 'problem' and "opportunity"."parent_id" is not null and "opportunity"."parent_kind" = 'outcome') or ("opportunity"."kind" = 'solution' and "opportunity"."parent_id" is not null and "opportunity"."parent_kind" = 'problem'))
);
--> statement-breakpoint
CREATE TABLE "pack" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"judge_model" text NOT NULL,
	"detect_threshold" real NOT NULL,
	"place_threshold" real NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pack_version_key" UNIQUE("workspace_id","name","version"),
	CONSTRAINT "pack_judge_model_pinned" CHECK ("pack"."judge_model" ~ '^[a-z][a-z0-9-]*-[0-9]+\.[0-9]+\.[0-9]+$'),
	CONSTRAINT "pack_thresholds_open_unit" CHECK ("pack"."detect_threshold" > 0 and "pack"."detect_threshold" < 1 and "pack"."place_threshold" > 0 and "pack"."place_threshold" < 1)
);
--> statement-breakpoint
CREATE TABLE "placement" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"mention_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"judge_answer_id" uuid NOT NULL,
	"confidence" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "placement_mention_key" UNIQUE("mention_id"),
	CONSTRAINT "placement_confidence_unit" CHECK ("placement"."confidence" >= 0 and "placement"."confidence" <= 1)
);
--> statement-breakpoint
CREATE TABLE "sentence" (
	"item_id" uuid NOT NULL,
	"ordinal" smallint NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "sentence_item_id_ordinal_pk" PRIMARY KEY("item_id","ordinal"),
	CONSTRAINT "sentence_ordinal_nonnegative" CHECK ("sentence"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "source" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "source_kind" NOT NULL,
	"name" text NOT NULL,
	"item_kind" "item_kind" NOT NULL,
	"field_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cursor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_answer" ADD CONSTRAINT "judge_answer_pack_id_pack_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."pack"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_answer" ADD CONSTRAINT "judge_answer_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link" ADD CONSTRAINT "link_opportunity_id_opportunity_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mention" ADD CONSTRAINT "mention_pack_id_pack_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."pack"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mention" ADD CONSTRAINT "mention_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mention" ADD CONSTRAINT "mention_start_fk" FOREIGN KEY ("item_id","sentence_start") REFERENCES "public"."sentence"("item_id","ordinal") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mention" ADD CONSTRAINT "mention_end_fk" FOREIGN KEY ("item_id","sentence_end") REFERENCES "public"."sentence"("item_id","ordinal") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_parent_fk" FOREIGN KEY ("parent_id","parent_kind","workspace_id") REFERENCES "public"."opportunity"("id","kind","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack" ADD CONSTRAINT "pack_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement" ADD CONSTRAINT "placement_mention_id_mention_id_fk" FOREIGN KEY ("mention_id") REFERENCES "public"."mention"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement" ADD CONSTRAINT "placement_opportunity_id_opportunity_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement" ADD CONSTRAINT "placement_judge_answer_id_judge_answer_id_fk" FOREIGN KEY ("judge_answer_id") REFERENCES "public"."judge_answer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence" ADD CONSTRAINT "sentence_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_workspace_date_idx" ON "item" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "judge_answer_question_idx" ON "judge_answer" USING btree ("pack_id","question_key");--> statement-breakpoint
CREATE INDEX "opportunity_workspace_kind_idx" ON "opportunity" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE INDEX "opportunity_parent_idx" ON "opportunity" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "placement_opportunity_idx" ON "placement" USING btree ("opportunity_id");