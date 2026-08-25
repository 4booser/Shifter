'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { apiErrorMessage } from '@/lib/api/http';
import { Team, teamApi } from '@/lib/api/team';
import { useI18n } from '@/lib/i18n';
import { useReveal } from '@/lib/fx';
import { Shell } from '@/components/layout/shell';
import { Alert } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';

export default function TeamPage() {
  return (
    <Shell>
      <TeamAdmin />
    </Shell>
  );
}

/**
 * Team membership: create, join, invite, leave. The rota itself lives on the
 * schedule page — a grid that wide deserves the width, and the things people
 * do rarely do not.
 */
function TeamAdmin() {
  const revealHost = useReveal<HTMLDivElement>();
  const { t } = useI18n();

  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [copied, setCopied] = useState<number | null>(null);

  const load = () =>
    void teamApi
      .list()
      .then(setTeams)
      .catch((caught) => setError(apiErrorMessage(caught)))
      .finally(() => setLoading(false));

  useEffect(load, []);

  const run = async (call: Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);

    try {
      await call;
      after?.();
      load();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const leave = (team: Team) => {
    const question = team.is_owner
      ? t('You own this team — leaving deletes it for everyone. Continue?')
      : t('Leave this team?');

    if (!window.confirm(question)) return;

    void run(teamApi.leave(team.id));
  };

  const copyCode = async (team: Team) => {
    if (!team.invite_code) return;

    try {
      await navigator.clipboard.writeText(team.invite_code);
      setCopied(team.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard access can be refused; the code is on screen to read anyway.
    }
  };

  return (
    <div ref={revealHost} className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-[1.3rem] font-bold tracking-tight">{t('Team')}</h1>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {/* ==== Your teams ==== */}
      {loading ? (
        <p className="field-hint">{t('Loading…')}</p>
      ) : (
        teams.map((team) => (
          <section key={team.id} className="card reveal p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[1.05rem] font-bold">{team.name}</h2>
              <span className="chip">
                {team.member_count} {t('people')}
              </span>
              {team.is_owner && <span className="chip border-(--accent)/40 text-(--accent)">{t('owner')}</span>}
              <span className="ml-auto flex gap-1.5">
                <Link href="/schedule" className="btn btn-sm">
                  <Icon name="calendar" size={13} />
                  {t('Open the rota')}
                </Link>
                <button type="button" className="btn btn-quiet btn-sm btn-danger" disabled={busy} onClick={() => leave(team)}>
                  {t(team.is_owner ? 'Delete team' : 'Leave')}
                </button>
              </span>
            </div>

            {team.invite_code && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="field-hint">{t('Invite code')}:</span>
                <code className="rounded-(--radius) border border-border bg-surface-2 px-2.5 py-1 text-[1rem] font-bold tracking-[0.2em]">
                  {team.invite_code}
                </code>
                <button type="button" className="btn btn-sm" onClick={() => void copyCode(team)}>
                  <Icon name="copy" size={13} />
                  {t(copied === team.id ? 'Copied' : 'Copy')}
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={busy}
                  title={t('A new code locks the old one out')}
                  onClick={() => void run(teamApi.rotateCode(team.id))}
                >
                  <Icon name="repeat" size={13} />
                  {t('New code')}
                </button>
              </div>
            )}
          </section>
        ))
      )}

      {/* ==== Join ==== */}
      <section className="card reveal p-4">
        <h2 className="mb-2 text-[0.98rem] font-bold">{t('Join a crew')}</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="field-input w-40 uppercase tracking-[0.15em]"
            maxLength={6}
            placeholder="ABC123"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
          />
          <input
            className="field-input flex-1"
            placeholder={t('Name the crew sees (optional)')}
            maxLength={40}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || joinCode.trim() === ''}
            onClick={() =>
              void run(teamApi.join(joinCode.trim(), displayName.trim() || null), () => {
                setJoinCode('');
                setDisplayName('');
              })
            }
          >
            {t('Join')}
          </button>
        </div>
        <p className="field-hint mt-1.5">{t('Ask whoever runs the rota for the six-letter code.')}</p>
      </section>

      {/* ==== Create ==== */}
      <section className="card reveal p-4">
        <h2 className="mb-2 text-[0.98rem] font-bold">{t('Start a team')}</h2>
        <div className="flex gap-2">
          <input
            className="field-input flex-1"
            placeholder={t('Bar on the corner')}
            maxLength={40}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || newName.trim() === ''}
            onClick={() => void run(teamApi.create(newName.trim()), () => setNewName(''))}
          >
            {t('Create')}
          </button>
        </div>
        <p className="field-hint mt-1.5">
          {t('A shared rota shows who is on and for how long. Rates, tips and sales stay yours.')}
        </p>
      </section>
    </div>
  );
}
