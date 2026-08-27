'use client';

import Link from 'next/link';

import { Icon } from '@/components/ui/icon';

/**
 * What a tab says before it has anything to say. Every empty screen answers
 * the same two questions — what is this for, and what do I press — because a
 * blank panel with one grey sentence teaches nobody anything and reads like
 * something failed to load.
 */
export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
  /** The one thing worth doing from here. A link, or a button that does it. */
  action?: { label: string; href?: string; onClick?: () => void };
}) {
  return (
    <div className="card reveal flex flex-col items-center gap-2 p-8 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-(--accent-soft) text-(--accent)">
        <Icon name={icon} size={20} />
      </span>

      <p className="text-[1.02rem] font-bold">{title}</p>
      <p className="field-hint max-w-[34rem]">{children}</p>

      {action !== undefined &&
        (action.href !== undefined ? (
          <Link href={action.href} className="btn btn-primary mt-1.5">
            {action.label}
          </Link>
        ) : (
          <button type="button" className="btn btn-primary mt-1.5" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
    </div>
  );
}
