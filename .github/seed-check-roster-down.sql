-- What going back to TeamRoster owes the rows: free text back from the positions, no day without hours, nothing else lost.
DO $$
BEGIN
    IF (SELECT count(*) FROM "RosterPeople") <> 6 THEN
        RAISE EXCEPTION 'roster people were lost on the way down';
    END IF;

    IF (SELECT string_agg("Name" || '=' || coalesce("Position", '-'), ',' ORDER BY "Id") FROM "RosterPeople")
        IS DISTINCT FROM 'Толик=Кальяны,Гриша=Кальяны,Паша=Кальяны,Света=Бар,Женя=-,Оля=Бар' THEN
        RAISE EXCEPTION 'the free-text positions did not come back: %',
            (SELECT string_agg("Name" || '=' || coalesce("Position", '-'), ',' ORDER BY "Id") FROM "RosterPeople");
    END IF;

    IF (SELECT count(*) FROM "RosterShifts") <> 2
        OR (SELECT count(*) FROM "RosterShifts" WHERE "StartTime" = '12:00' AND "EndTime" = '00:00') <> 2 THEN
        RAISE EXCEPTION 'the way down should drop the day with no time and keep the two with hours';
    END IF;
END $$;
