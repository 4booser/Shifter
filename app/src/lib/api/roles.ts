import { GigCategory } from '@/lib/api/gigs';

/**
 * The thirty-six roles.
 *
 * The id is what travels — a board posted from either front stores
 * «cook-hot», never a word — and the name is a dictionary key the reader's
 * own language fills in. Wrap a lookup in t() at the render site.
 */
export const ROLE_NAMES: Record<GigCategory, string> = {
  'managing': 'General manager',
  'floor-manager': 'Floor manager',
  'administrator': 'Administrator',
  'chef': 'Head chef',
  'sous-chef': 'Sous chef',
  'shift-lead': 'Shift lead',
  'bartender': 'Bartender',
  'barback': 'Barback',
  'barista': 'Barista',
  'sommelier': 'Sommelier',
  'hookah': 'Hookah master',
  'waiter': 'Waiter',
  'runner': 'Runner',
  'host': 'Host',
  'cashier': 'Cashier',
  'busser': 'Busser',
  'cook-hot': 'Cook (hot line)',
  'cook-cold': 'Cook (cold line)',
  'cook-universal': 'All-round cook',
  'prep': 'Prep cook',
  'grill': 'Grill',
  'wok': 'Wok cook',
  'pizzaiolo': 'Pizzaiolo',
  'sushi': 'Sushi chef',
  'shawarma': 'Shawarma cook',
  'butcher': 'Butcher',
  'pastry': 'Pastry chef',
  'baker': 'Baker',
  'dishwasher': 'Dishwasher',
  'cleaner': 'Cleaner',
  'storekeeper': 'Storekeeper',
  'security': 'Security',
  'courier': 'Courier',
  'catering': 'Catering',
  'dj': 'DJ',
  'promoter': 'Promoter',
};

export const roleName = (id: string) => ROLE_NAMES[id as GigCategory] ?? id;
