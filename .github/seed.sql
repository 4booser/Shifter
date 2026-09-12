-- A database with rows in it.
--
-- Migrations have only ever been applied to an empty one, which hides every
-- failure that actually matters: a foreign key added over rows that already
-- exist, a unique index over duplicates, a NOT NULL on a populated table.
-- Production was the first non-empty database any migration had ever met.
--
-- Enough rows to exercise the shapes that go wrong, and nothing more. Columns
-- are named explicitly so a new column with a default does not break this
-- file — but a column that is NOT NULL and has no default has to be named
-- here too, and three of them were not. The job has therefore been failing on
-- its very first statement, which means the check it exists to perform has
-- never once run. CreatedAt, Archived, Status, Slots, PayAmount, JoinedAt.

INSERT INTO "Users" ("Login", "PasswordHash", "FirstName", "LastName", "CreatedAt")
VALUES
  ('seed-one', 'x', 'Seed', 'One', TIMESTAMPTZ '2026-01-01 10:00:00+00'),
  ('seed-two', 'x', 'Seed', 'Two', TIMESTAMPTZ '2026-01-01 10:00:00+00');

INSERT INTO "Locations" ("UserId", "Name", "Colour")
SELECT "Id", 'Seeded bar', '#4488CC' FROM "Users" WHERE "Login" = 'seed-one';

INSERT INTO "Shifts" ("UserId", "Name", "StartTime", "EndTime", "SalaryPeriod", "SalaryAmount", "Archived")
SELECT "Id", 'Seeded shift', '18:00', '02:00', 0, 100, false FROM "Users" WHERE "Login" = 'seed-one';

INSERT INTO "Days" ("UserId", "Date")
SELECT "Id", DATE '2026-01-05' FROM "Users" WHERE "Login" = 'seed-one';

-- Tied to the seeded rows by name, not «any day crossed with any shift,
-- take the first». On an empty database those are the same thing; on one
-- with rows already in it — which is the entire point of this file — the
-- cross join picked somebody else's pair and collided with a unique index.
INSERT INTO "DayShifts" ("DayId", "ShiftId", "SalaryPeriod", "SalaryAmount", "StartTime", "EndTime", "BreakMinutes", "Worked")
SELECT d."Id", s."Id", 0, 100, '18:00', '02:00', 0, true
FROM "Days" d
JOIN "Users" u ON u."Id" = d."UserId" AND u."Login" = 'seed-one'
JOIN "Shifts" s ON s."UserId" = u."Id" AND s."Name" = 'Seeded shift'
WHERE d."Date" = DATE '2026-01-05';

-- A team with both people in it, so ownership and membership are exercised.
INSERT INTO "Teams" ("Name", "OwnerUserId", "InviteCode", "CreatedAt")
SELECT 'Seeded crew', "Id", 'SEED01', TIMESTAMPTZ '2026-01-01 10:00:00+00'
FROM "Users" WHERE "Login" = 'seed-one';

INSERT INTO "TeamMembers" ("TeamId", "UserId", "DisplayName", "Colour", "JoinedAt")
SELECT t."Id", u."Id", u."FirstName", '#4488CC', TIMESTAMPTZ '2026-01-01 10:00:00+00'
FROM "Teams" t, "Users" u
WHERE t."InviteCode" = 'SEED01';

-- Two listings, because a unique index added to a new column has to survive
-- more than one row.
INSERT INTO "GigListings" ("OwnerUserId", "Venue", "Title", "City", "Category", "Date", "StartTime", "EndTime", "PayPeriod", "PayAmount", "Slots", "Status", "CreatedAt")
SELECT "Id", 'Seeded venue', 'Seeded gig', 'Kyiv', 0, DATE '2026-02-01', '18:00', '02:00', 'hour', 900, 1, 0, TIMESTAMPTZ '2026-01-01 10:00:00+00'
FROM "Users" WHERE "Login" = 'seed-one';

INSERT INTO "GigListings" ("OwnerUserId", "Venue", "Title", "City", "Category", "Date", "StartTime", "EndTime", "PayPeriod", "PayAmount", "Slots", "Status", "CreatedAt")
SELECT "Id", 'Seeded venue two', 'Seeded gig two', 'Kyiv', 0, DATE '2026-02-02', '18:00', '02:00', 'hour', 1100, 2, 0, TIMESTAMPTZ '2026-01-01 10:00:00+00'
FROM "Users" WHERE "Login" = 'seed-two';
