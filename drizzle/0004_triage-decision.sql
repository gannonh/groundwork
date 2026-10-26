CREATE TYPE "public"."triage_action" AS ENUM('accept', 'move', 'discard');--> statement-breakpoint
CREATE TABLE "triage_decision" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"mention_id" uuid NOT NULL,
	"judge_answer_id" uuid NOT NULL,
	"judge_opportunity_id" uuid NOT NULL,
	"judge_confidence" real NOT NULL,
	"action" "triage_action" NOT NULL,
	"opportunity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "triage_decision_mention_key" UNIQUE("mention_id"),
	CONSTRAINT "triage_decision_answer_shape" CHECK (("triage_decision"."action" = 'discard' and "triage_decision"."opportunity_id" is null) or ("triage_decision"."action" = 'accept' and "triage_decision"."opportunity_id" = "triage_decision"."judge_opportunity_id") or ("triage_decision"."action" = 'move' and "triage_decision"."opportunity_id" is not null and "triage_decision"."opportunity_id" <> "triage_decision"."judge_opportunity_id")),
	CONSTRAINT "triage_decision_judge_confidence_unit" CHECK ("triage_decision"."judge_confidence" >= 0 and "triage_decision"."judge_confidence" <= 1)
);
--> statement-breakpoint
ALTER TABLE "triage_decision" ADD CONSTRAINT "triage_decision_mention_id_mention_id_fk" FOREIGN KEY ("mention_id") REFERENCES "public"."mention"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triage_decision" ADD CONSTRAINT "triage_decision_judge_answer_id_judge_answer_id_fk" FOREIGN KEY ("judge_answer_id") REFERENCES "public"."judge_answer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triage_decision" ADD CONSTRAINT "triage_decision_judge_opportunity_id_opportunity_id_fk" FOREIGN KEY ("judge_opportunity_id") REFERENCES "public"."opportunity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triage_decision" ADD CONSTRAINT "triage_decision_opportunity_id_opportunity_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunity"("id") ON DELETE cascade ON UPDATE no action;