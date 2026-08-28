'use client';

import { useEffect, useState } from 'react';

import { WeatherEffect, weatherApi } from '@/lib/api/weather';
import { todayKey } from '@/lib/calendar/calendar-date';
import { useI18n } from '@/lib/i18n';
import { Money } from '@/components/ui/bits';

/**
 * The one thing everybody in the trade believes and nobody has checked.
 *
 * "Дождь — и вечер мёртвый" is said in every kitchen on the continent. It is
 * also checkable, for nothing, against a record that has been sitting there
 * the whole time: their days, their place, and measurements from a public
 * archive that neither they nor we can nudge.
 *
 * The wording is the whole design. It says what the record shows and refuses
 * to say why — a wet month and a slow month can sit on top of each other
 * without one causing the other, and "rain costs you ₴300 a shift" is a claim
 * this data cannot support however much it looks like it can.
 */
export function WeatherEffectCard() {
  const { t } = useI18n();

  const [places, setPlaces] = useState<WeatherEffect[] | null>(null);

  useEffect(() => {
    void weatherApi
      .effect(todayKey())
      .then((response) => setPlaces(response.places))
      .catch(() => setPlaces([]));
  }, []);

  // Only the places where the gap is big enough to be worth a sentence. A
  // card that appears to report a four per cent wobble teaches people that
  // this card reports noise.
  const worth = (places ?? []).filter((place) => place.worth);

  if (worth.length === 0) return null;

  return (
    <section className="card reveal p-4">
      <h2 className="mb-1 text-[0.98rem] font-bold">{t('Rain, in your own record')}</h2>
      <p className="field-hint mb-3">
        {t('Your days, your place, and a public weather archive. A coincidence, not a cause.')}
      </p>

      <div className="flex flex-col gap-3">
        {worth.map((place) => (
          <div key={place.location_id} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[0.9rem] font-semibold">{place.place}</span>
              <span
                className={`tabular text-[1.05rem] font-bold ${
                  place.percent < 0 ? 'text-danger' : 'text-good'
                }`}
              >
                {place.percent > 0 ? '+' : '−'}
                {Math.abs(place.percent)}%
              </span>
            </div>

            {/* Two rates side by side rather than one percentage on its own:
                the percentage is the headline, the rates are what makes it
                checkable by somebody who does not trust the headline. */}
            <div className="flex gap-4 text-[0.82rem] text-muted">
              <span>
                🌧 <Money value={place.wet_per_hour} />/{t('h')} · {place.wet_days} {t('days')}
              </span>
              <span>
                ☀️ <Money value={place.dry_per_hour} />/{t('h')} · {place.dry_days} {t('days')}
              </span>
            </div>
          </div>
        ))}
      </div>

      <p className="field-hint mt-3">
        {t('Tips per hour on days with rain against days without. Wage does not move with the weather, so it is left out.')}
      </p>
    </section>
  );
}
