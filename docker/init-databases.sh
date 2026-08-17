#!/bin/sh
# Postgres creates POSTGRES_DB on first boot and nothing else. Shifter keeps
# refresh tokens in a second database, so it is created here. Runs once, on an
# empty data directory — an existing volume never re-runs this.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE tokens OWNER $POSTGRES_USER;
EOSQL
