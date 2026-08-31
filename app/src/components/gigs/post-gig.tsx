import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  GIG_CATEGORIES,
  GIG_GROUPS,
  GigCategory,
  GigEmployment,
  GigSave,
  gigApi,
  shrinkPhoto,
} from '@/lib/api/gigs';
import { roleName } from '@/lib/api/roles';
import { todayKey } from '@/lib/calendar/calendar-date';
import { useSettings } from '@/lib/settings/store';
import { cn } from '@/lib/utils';

/** The board's own bounds, said once. */
const MIN_PHOTOS = 3;
const MAX_PHOTOS = 6;

const GROUP_NAMES: Record<string, string> = {
  Management: 'управление',
  Bar: 'бар',
  Floor: 'зал',
  Kitchen: 'кухня',
  Bakery: 'пекарня',
  'Back of house': 'подсобка',
  Delivery: 'доставка',
  Events: 'мероприятия',
};

/**
 * Posting a shift somebody else could take.
 *
 * Short on purpose: the person filling this in is usually short a bartender
 * for tonight, and every field they have to think about is a field between
 * them and somebody turning up. Everything the board does not need to show a
 * card is left out.
 */
export function PostGig({ onClose }: { onClose: () => void }) {
  const settings = useSettings((state) => state.settings);
  const client = useQueryClient();

  const [form, setForm] = useState<GigSave>({
    venue: '',
    category: 'bartender',
    employment: 'freelance',
    photos: [],
    schedule: null,
    title: '',
    details: null,
    date: todayKey(),
    start: '17:00',
    end: '23:00',
    pay_amount: 0,
    pay_period: 'shift',
    pay_percent: null,
    city: '',
    slots: 1,
  });

  const set = <Key extends keyof GigSave>(key: Key, value: GigSave[Key]) =>
    setForm((was) => ({ ...was, [key]: value }));

  const post = useMutation({
    mutationFn: () => gigApi.create(form),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['gigs'] });
      toast.success('Объявление на доске');
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [shrinking, setShrinking] = useState(false);

  /* Shrunk here rather than sent whole: a phone photo is four megabytes and
     the listing carries them inline, so the browser does the resizing the
     wire cannot afford. */
  const take = async (files: FileList | null) => {
    if (files === null || files.length === 0) return;

    setShrinking(true);

    const room = MAX_PHOTOS - form.photos.length;
    const taken: string[] = [];

    for (const file of [...files].slice(0, room)) {
      try {
        taken.push(await shrinkPhoto(file));
      } catch {
        toast.error(`Не вышло прочитать ${file.name}`);
      }
    }

    setForm((was) => ({ ...was, photos: [...was.photos, ...taken].slice(0, MAX_PHOTOS) }));
    setShrinking(false);
  };

  const ready =
    form.venue.trim() !== '' &&
    form.title.trim() !== '' &&
    form.city.trim() !== '' &&
    form.photos.length >= MIN_PHOTOS &&
    (form.pay_amount > 0 || (form.pay_percent ?? 0) > 0);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Нужен человек</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="field-label">Заведение</span>
              <Input
                value={form.venue}
                placeholder="Бар «Сова»"
                autoFocus
                onChange={(event) => set('venue', event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="field-label">Город</span>
              <Input
                value={form.city}
                placeholder="Днепр"
                onChange={(event) => set('city', event.target.value)}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="field-label">Заголовок</span>
            <Input
              value={form.title}
              placeholder="Бармен на вечер пятницы"
              maxLength={80}
              onChange={(event) => set('title', event.target.value)}
            />
          </label>

          <Pills
            label="Кого ищете"
            options={GIG_GROUPS.flatMap((group) =>
              GIG_CATEGORIES.filter((one) => one.group === group).map((one) => ({
                value: one.id,
                label: `${one.emoji} ${roleName(one.id)}`,
                group,
              })),
            )}
            value={form.category}
            onPick={(value) => set('category', value as GigCategory)}
          />

          <Pills
            label="Какая работа"
            options={[
              { value: 'freelance', label: 'разовая смена' },
              { value: 'permanent', label: 'постоянная' },
            ]}
            value={form.employment}
            onPick={(value) => set('employment', value as GigEmployment)}
          />

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="field-label">
                {form.employment === 'permanent' ? 'Выходить с' : 'Когда'}
              </span>
              <Input
                type="date"
                value={form.date}
                onChange={(event) => set('date', event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="field-label">С</span>
              <Input
                type="time"
                value={form.start}
                onChange={(event) => set('start', event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="field-label">До</span>
              <Input
                type="time"
                value={form.end}
                onChange={(event) => set('end', event.target.value)}
              />
            </label>
          </div>

          <Pills
            label="Платим"
            options={[
              { value: 'shift', label: 'за смену' },
              { value: 'hour', label: 'в час' },
              ...(form.employment === 'permanent'
                ? [{ value: 'month', label: 'в месяц' }]
                : []),
            ]}
            value={form.pay_period}
            onPick={(value) => set('pay_period', value as GigSave['pay_period'])}
          />

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="field-label">Сколько, {settings.currency}</span>
              <Input
                inputMode="decimal"
                value={form.pay_amount === 0 ? '' : `${form.pay_amount}`}
                placeholder="0"
                onChange={(event) =>
                  set('pay_amount', Number(event.target.value.replace(',', '.')) || 0)
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="field-label">+ % с продаж</span>
              <Input
                inputMode="decimal"
                value={form.pay_percent == null ? '' : `${form.pay_percent}`}
                placeholder="—"
                onChange={(event) =>
                  set(
                    'pay_percent',
                    event.target.value.trim() === ''
                      ? null
                      : Number(event.target.value.replace(',', '.')),
                  )
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="field-label">Сколько человек</span>
              <Input
                inputMode="numeric"
                value={`${form.slots}`}
                onChange={(event) => set('slots', Math.max(1, Number(event.target.value) || 1))}
              />
            </label>
          </div>

          {/* The board asks for three photos and refuses fewer: a listing with
              no pictures of the room is the kind nobody answers, and the
              server would rather say so than let one through. */}
          <div className="flex flex-col gap-1.5">
            <span className="field-label">
              Фото места — от {MIN_PHOTOS} до {MAX_PHOTOS}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {form.photos.map((photo, index) => (
                <span key={photo.slice(-32)} className="relative">
                  <img
                    src={photo}
                    alt=""
                    className="size-16 rounded-lg object-cover"
                  />
                  <button
                    type="button"
                    aria-label={`Убрать фото ${index + 1}`}
                    onClick={() =>
                      set('photos', form.photos.filter((one) => one !== photo))
                    }
                    className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-surface text-muted-foreground shadow-sm transition-colors hover:text-danger"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}

              {form.photos.length < MAX_PHOTOS && (
                <label
                  className={cn(
                    'grid size-16 cursor-pointer place-items-center rounded-lg border border-dashed border-border',
                    'text-muted-foreground transition-colors hover:border-border-strong hover:text-ink',
                    shrinking && 'opacity-50',
                  )}
                >
                  {shrinking ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ImagePlus className="size-4" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => void take(event.target.files)}
                  />
                </label>
              )}
            </div>
            {form.photos.length > 0 && form.photos.length < MIN_PHOTOS && (
              <span className="field-hint">
                Ещё {MIN_PHOTOS - form.photos.length}, и можно размещать.
              </span>
            )}
          </div>

          <label className="flex flex-col gap-1">
            <span className="field-label">Подробности</span>
            <textarea
              className="min-h-20 rounded-[var(--radius-field)] border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:border-[var(--accent)]"
              value={form.details ?? ''}
              maxLength={800}
              placeholder="Что делать, какой опыт нужен, как добраться."
              onChange={(event) =>
                set('details', event.target.value.trim() === '' ? null : event.target.value)
              }
            />
          </label>

          {/* Urgency is a claim about tonight, so it can only be made about
              tonight — a board where everything is urgent has no urgent on it. */}
          {form.date === todayKey() && form.employment === 'freelance' && (
            <button
              type="button"
              role="switch"
              aria-checked={form.urgent === true}
              onClick={() => set('urgent', form.urgent !== true)}
              className="flex items-center justify-between gap-3 text-left"
            >
              <span>
                <span className="block text-sm font-medium">Горит</span>
                <span className="field-hint">Кто-то не вышел, а смена уже сегодня.</span>
              </span>
              <span
                className={cn(
                  'relative h-6 w-10 flex-none rounded-full transition-colors',
                  form.urgent === true ? 'bg-[var(--danger)]' : 'bg-surface-2 ring-1 ring-border',
                )}
              >
                <span
                  className={cn(
                    'absolute top-1 size-4 rounded-full bg-surface shadow-sm transition-all',
                    form.urgent === true ? 'left-5' : 'left-1',
                  )}
                />
              </span>
            </button>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button disabled={!ready || post.isPending} onClick={() => post.mutate()}>
            Разместить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Pills, grouped where the list is long enough to need the grouping. */
function Pills({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: { value: string; label: string; group?: string }[];
  value: string;
  onPick: (value: string) => void;
}) {
  const groups = [...new Set(options.map((one) => one.group).filter(Boolean))] as string[];

  return (
    <div className="flex flex-col gap-1.5">
      <span className="field-label">{label}</span>
      {groups.length === 0 ? (
        <Row options={options} value={value} onPick={onPick} />
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((group) => (
            <div key={group} className="flex flex-col gap-1">
              <span className="field-hint">{GROUP_NAMES[group] ?? group}</span>
              <Row
                options={options.filter((one) => one.group === group)}
                value={value}
                onPick={onPick}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  options,
  value,
  onPick,
}: {
  options: { value: string; label: string }[];
  value: string;
  onPick: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onPick(option.value)}
          className={cn(
            'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
            value === option.value
              ? 'border-transparent bg-accent text-accent-foreground'
              : 'border-border text-muted-foreground hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
