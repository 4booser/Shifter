-- What the migration owes the rows .github/seed.sql put in before it ran.
DO $$
DECLARE
    first_roster integer := (SELECT "Id" FROM "Rosters" WHERE "Title" = 'Seeded roster');
    second_roster integer := (SELECT "Id" FROM "Rosters" WHERE "Title" = 'Seeded roster two');
BEGIN
    IF (SELECT count(*) FROM "RosterPeople") <> 6 THEN
        RAISE EXCEPTION 'roster people were lost';
    END IF;

    IF (SELECT count(*) FROM "RosterShifts" WHERE "StartTime" = '12:00' AND "EndTime" = '00:00') <> 2 THEN
        RAISE EXCEPTION 'roster shifts or their hours were lost';
    END IF;

    IF (SELECT string_agg("Name", ',' ORDER BY "Id") FROM "RosterPositions" WHERE "RosterId" = first_roster)
        IS DISTINCT FROM 'Кальяны,Бар' THEN
        RAISE EXCEPTION 'the first roster should hold Кальяны then Бар, each once, in the first spelling';
    END IF;

    IF (SELECT count(*) FROM "RosterPositions" WHERE "RosterId" = second_roster AND "Name" = 'Бар') <> 1 THEN
        RAISE EXCEPTION 'the same word on another roster has to be a position of its own';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "RosterPeople" p
        JOIN "RosterPositions" pos ON pos."Id" = p."RosterPositionId"
        WHERE pos."RosterId" <> p."RosterId"
    ) THEN
        RAISE EXCEPTION 'somebody was linked to a position on another roster';
    END IF;

    IF (SELECT count(*) FROM "RosterPeople" p JOIN "RosterPositions" pos ON pos."Id" = p."RosterPositionId"
        WHERE p."RosterId" = first_roster AND pos."Name" = 'Кальяны') <> 3 THEN
        RAISE EXCEPTION 'every spelling of Кальяны should point at the one position';
    END IF;

    IF EXISTS (SELECT 1 FROM "RosterPeople" WHERE "RosterPositionId" IS NULL AND "Name" <> 'Женя') THEN
        RAISE EXCEPTION 'somebody with a position lost it';
    END IF;

    IF EXISTS (SELECT 1 FROM "RosterPeople" p JOIN "RosterPositions" pos ON pos."Id" = p."RosterPositionId"
               WHERE p."Position" IS DISTINCT FROM pos."Name") THEN
        RAISE EXCEPTION 'the old column no longer says what the position is called';
    END IF;

    IF EXISTS (SELECT 1 FROM "RosterPositions" WHERE "HoursMode" <> 0 OR "StartTime" IS NOT NULL) THEN
        RAISE EXCEPTION 'a converted position should have no set time';
    END IF;

    IF EXISTS (SELECT 1 FROM "Rosters" WHERE "VenueHours" IS NULL)
        OR EXISTS (SELECT 1 FROM "RosterPeople" WHERE "WeekHours" IS NULL)
        OR EXISTS (SELECT 1 FROM "RosterPositions" WHERE "WeekHours" IS NULL) THEN
        RAISE EXCEPTION 'a JSON column was left NULL';
    END IF;
END $$;
