-- A database with rows in it.
--
-- Migrations have only ever been applied to an empty one, which hides every
-- failure that actually matters: a foreign key added over rows that already
-- exist, a unique index over duplicates, a NOT NULL on a populated table.
-- Production was the first non-empty database any migration had ever met.
--
-- Enough rows to exercise the shapes that go wrong, and nothing more. Columns
-- are named explicitly so a new column with a default does not break this
-- file, and everything else is left to its default.

INSERT INTO "Users" ("Login", "PasswordHash", "FirstName", "LastName")
VALUES
  ('seed-one', 'x', 'Seed', 'One'),
  ('seed-two', 'x', 'Seed', 'Two');

INSERT INTO "Locations" ("UserId", "Name", "Colour")
SELECT "Id", 'Seeded bar', '#4488CC' FROM "Users" WHERE "Login" = 'seed-one';

INSERT INTO "Shifts" ("UserId", "Name", "StartTime", "EndTime", "SalaryPeriod", "SalaryAmount")
SELECT "Id", 'Seeded shift', '18:00', '02:00', 0, 100 FROM "Users" WHERE "Login" = 'seed-one';

INSERT INTO "Days" ("UserId", "Date")
SELECT "Id", DATE '2026-01-05' FROM "Users" WHERE "Login" = 'seed-one';

INSERT INTO "DayShifts" ("DayId", "ShiftId", "SalaryPeriod", "SalaryAmount", "StartTime", "EndTime", "BreakMinutes", "Worked")
SELECT d."Id", s."Id", 0, 100, '18:00', '02:00', 0, true
FROM "Days" d, "Shifts" s
LIMIT 1;

-- A team with both people in it, so ownership and membership are exercised.
INSERT INTO "Teams" ("Name", "OwnerUserId", "InviteCode")
SELECT 'Seeded crew', "Id", 'SEED01' FROM "Users" WHERE "Login" = 'seed-one';

INSERT INTO "TeamMembers" ("TeamId", "UserId", "DisplayName", "Colour")
SELECT t."Id", u."Id", u."FirstName", '#4488CC'
FROM "Teams" t, "Users" u
WHERE t."InviteCode" = 'SEED01';

-- Two listings, because a unique index added to a new column has to survive
-- more than one row.
INSERT INTO "GigListings" ("OwnerUserId", "Venue", "Title", "City", "Category", "Date", "StartTime", "EndTime", "PayPeriod")
SELECT "Id", 'Seeded venue', 'Seeded gig', 'Kyiv', 0, DATE '2026-02-01', '18:00', '02:00', 'hour'
FROM "Users" WHERE "Login" = 'seed-one';

INSERT INTO "GigListings" ("OwnerUserId", "Venue", "Title", "City", "Category", "Date", "StartTime", "EndTime", "PayPeriod")
SELECT "Id", 'Seeded venue two', 'Seeded gig two', 'Kyiv', 0, DATE '2026-02-02', '18:00', '02:00', 'hour'
FROM "Users" WHERE "Login" = 'seed-two';
