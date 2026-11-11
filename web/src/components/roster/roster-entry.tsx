'use client';

import Link from 'next/link';

import { useI18n } from '@/lib/i18n';
import { Icon } from '@/components/ui/icon';

/** The way into a schedule written for people with no account. It says so, because the page around it is the shared one that needs a crew. */
export function RosterEntry() {
  const { t } = useI18n();

  return (
    <Link href="/roster" className="card flex items-center gap-3 p-3 hover:bg-surface-2">
      <span className="grid size-9 flex-none place-items-center rounded-full bg-(--accent-soft) text-(--accent-read)">
        <Icon name="users" size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.92rem] font-bold">{t('Schedule for a team')}</span>
        <span className="field-hint block">
          {t('Write the shifts for everyone yourself and drop one link in the group chat. Nobody has to register.')}
        </span>
      </span>
      <Icon name="chevron-right" size={16} className="flex-none text-muted" />
    </Link>
  );
}
