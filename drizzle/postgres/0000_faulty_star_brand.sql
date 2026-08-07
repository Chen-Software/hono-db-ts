CREATE TABLE "movies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "movies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text,
	"release_year" integer,
	CONSTRAINT "movies_release_year_check" CHECK ("movies"."release_year" >= 1888)
);
