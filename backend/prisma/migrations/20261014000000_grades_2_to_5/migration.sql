-- Переход с баллов (0..maxScore) на оценки по шкале 2–5 с шагом 0,5.
-- Уже выставленные баллы переводятся в оценку по доле от максимума.

ALTER TABLE "Submission" ALTER COLUMN "score" TYPE DOUBLE PRECISION;

UPDATE "Submission" s
SET "score" = CASE
    WHEN s."score" / a."maxScore" >= 0.85 THEN 5
    WHEN s."score" / a."maxScore" >= 0.70 THEN 4
    WHEN s."score" / a."maxScore" >= 0.50 THEN 3
    ELSE 2
  END
FROM "Assignment" a
WHERE a."id" = s."assignmentId" AND s."score" IS NOT NULL;

ALTER TABLE "Assignment" DROP COLUMN "maxScore";
