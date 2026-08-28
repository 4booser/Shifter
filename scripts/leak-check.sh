#!/bin/sh
# Does anybody else's row come back?
#
# Two accounts, one of them creating a row of every kind, and then the other
# asking for that row by its id — by every verb the API offers. The only
# acceptable answers are 404 and 403. A 200 is a leak; a 500 is a leak waiting
# to be one.
#
# This exists because two of the privacy holes found in review were invisible
# to reading: the screen looked right and the extra data was in the response.
# The only way to catch that class is to ask as somebody else and look at what
# comes back — which is a script, not a code review.
#
#   scripts/leak-check.sh [base-url]
set -eu

BASE=${1:-http://localhost:5208}
API="$BASE/shifter/v1"
STAMP=$(date +%s)

fail=0
checked=0

say() { printf '%s\n' "$*"; }

# Logins are letters and digits only, so the pair is built without separators.
register() {
  curl -s -X POST "$API/auth/user/register" -H 'Content-Type: application/json' \
    -d "{\"login\":\"leak$1$STAMP\",\"password\":\"Passw0rd23\",\"first_name\":\"Leak\",\"last_name\":\"$1\"}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))'
}

# The whole point: the second account must never see the first one's rows.
OWNER=$(register owner)
OTHER=$(register other)

if [ -z "$OWNER" ] || [ -z "$OTHER" ]; then
  say "could not register two accounts against $BASE"
  exit 1
fi

post() {
  curl -s -X POST "$API/$1" -H "Authorization: Bearer $OWNER" \
    -H 'Content-Type: application/json' -d "$2" \
  | python3 -c 'import sys,json
try:
    print(json.load(sys.stdin).get("id", ""))
except Exception:
    print("")'
}

# ---- one row of every kind, owned by the first account ----
PLACE=$(post locations '{"name":"Leak bar","address":null,"colour":"#4488cc","pay_period":"Monthly","pay_day":1,"pay_anchor":null,"overtime_weekly_hours":40,"overtime_multiplier":1.5,"night_multiplier":1,"night_from":"22:00","night_to":"06:00","public_holiday_multiplier":1,"holiday_country":"UA","tip_out_of_tips_percent":0,"tip_out_of_sales_percent":0,"meal_deduction":0,"tax_percent":0,"tax_tips":false,"holiday_percent":0,"currency":""}')
SHIFT=$(post shifts "{\"name\":\"Leak shift\",\"symbol\":null,\"location_id\":$PLACE,\"start_time\":\"18:00\",\"end_time\":\"02:00\",\"salary_period\":\"hour\",\"salary_amount\":200,\"break_minutes\":0}")
PAYOUT=$(post payouts '{"period_from":"2026-08-01","period_to":"2026-08-31","amount":1000,"received_on":"2026-08-31","note":"leak","location_id":null}')
EXPENSE=$(post expenses '{"date":"2026-08-20","amount":300,"kind":"transport","note":"leak","location_id":null}')
DOCUMENT=$(post documents '{"kind":"medical","name":"Leak book","expires_on":"2027-01-01","note":null}')
GOAL=$(post goals '{"period":"month","amount":10000,"anchor":null,"note":null}')

# ---- and the other account asks for each of them ----
check() {
  method=$1; path=$2; want=$3
  checked=$((checked + 1))

  code=$(curl -s -o /dev/null -w '%{http_code}' -X "$method" "$API/$path" \
    -H "Authorization: Bearer $OTHER" -H 'Content-Type: application/json' \
    ${4:+-d "$4"})

  case "$code" in
    403|404) : ;;
    *)
      say "LEAK  $method $path answered $code (expected $want)"
      fail=$((fail + 1))
      ;;
  esac
}

[ -n "$PLACE" ]    && check GET    "locations/$PLACE" 404
[ -n "$PLACE" ]    && check DELETE "locations/$PLACE" 404
[ -n "$SHIFT" ]    && check PUT    "shifts/$SHIFT" 404 '{"name":"taken","symbol":null,"location_id":null,"start_time":"09:00","end_time":"17:00","salary_period":"hour","salary_amount":1,"break_minutes":0}'
# Templates are archived rather than deleted — the days they sit on keep their
# history — so that is the verb to try taking somebody else's with.
[ -n "$SHIFT" ]    && check POST   "shifts/$SHIFT/archived?value=true" 404
[ -n "$PLACE" ]    && check POST   "locations/$PLACE/archived?value=true" 404
[ -n "$PAYOUT" ]   && check DELETE "payouts/$PAYOUT" 404
[ -n "$EXPENSE" ]  && check DELETE "expenses/$EXPENSE" 404
[ -n "$DOCUMENT" ] && check DELETE "documents/$DOCUMENT" 404
[ -n "$DOCUMENT" ] && check PUT    "documents/$DOCUMENT" 404 '{"kind":"other","name":"taken","expires_on":"2027-01-01","note":null}'
[ -n "$GOAL" ]     && check DELETE "goals/$GOAL" 404

# Reputation is readable only about people who have put themselves in front of
# you. A stranger's id must not answer.
check GET "gigs/reputation/1" 404

say ""
say "$checked attempts, $fail leaked"

[ "$fail" -eq 0 ] || exit 1
