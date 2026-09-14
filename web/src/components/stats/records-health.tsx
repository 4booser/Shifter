'use client';

import { useEffect, useState } from 'react';

import { api } from '@/lib/api/http';
import { useI18n } from '@/lib/i18n';
import { Panel } from './panel';

interface Gap {
  kind: string;
  count: number;
  sample: string[];
  hurts: string;
}

/** «Дозаполнить» — the record's own health, as a map and not a moral. */
const KIND: Record<string, { title: string; hurts: string }> = {
  tips_unsaid: {
    title: 'Смены без записанных чаевых',
    hurts: 'занижает «чай по дням недели» и итоги месяца',
  },
  city_unsaid: {
    title: 'Места без города',
    hurts: 'не попадают в «где мой час дороже»',
  },
  actual_times_unsaid: {
    title: 'Смены без фактических часов',
    hurts: 'окна сна меряются по плану, а не по ночи',
  },
  rate_zero: {
    title: 'Часовые смены с нулевой ставкой',
    hurts: 'заработок этих дней — ноль, почти наверняка враньё',
  },
};

export function RecordsHealthCard() {
  const { t } = useI18n();

  const [gaps, setGaps] = useState<Gap[]>([]);

  useEffect(() => {
    void api<Gap[]>('/shifter/v1/health/records')
      .then(setGaps)
      .catch(() => setGaps([]));
  }, []);

  if (gaps.length === 0) return null;

  return (
    <Panel
      title={t('Worth filling in')}
      hint={t('Not homework — a map: each line names what the gap costs. The list shortens as you fill it.')}
    >
      <div className="flex flex-col gap-2.5">
        {gaps.map((gap) => {
          const known = KIND[gap.kind];

          if (known === undefined) return null;

          return (
            <div key={gap.kind} className="flex items-start gap-2.5">
              <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full bg-(--warn-soft) text-[0.78rem] font-bold text-warn-read tabular">
                {gap.count}
              </span>
              <div className="min-w-0">
                <p className="text-[0.9rem] font-semibold">{t(known.title)}</p>
                <p className="text-[0.8rem] text-muted">
                  {t(known.hurts)}
                  {gap.sample.length > 0 && (
                    <span className="text-faint"> · {t('e.g.')} {gap.sample.join(', ')}</span>
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
