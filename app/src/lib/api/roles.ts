import { GigCategory } from '@/lib/api/gigs';

/**
 * The thirty-six roles, in Russian.
 *
 * Lifted from the old client's dictionary rather than retranslated, so a
 * «повар горячего цеха» is called the same thing on both fronts and a board
 * posted from one reads correctly on the other.
 */
export const ROLE_NAMES: Record<GigCategory, string> = {
  'managing': 'Управляющий',
  'floor-manager': 'Менеджер зала',
  'administrator': 'Администратор',
  'chef': 'Шеф-повар',
  'sous-chef': 'Су-шеф',
  'shift-lead': 'Старший смены',
  'bartender': 'Бармен',
  'barback': 'Барбек',
  'barista': 'Бариста',
  'sommelier': 'Сомелье',
  'hookah': 'Кальянщик',
  'waiter': 'Официант',
  'runner': 'Раннер',
  'host': 'Хостес',
  'cashier': 'Кассир',
  'busser': 'Сборщик столов',
  'cook-hot': 'Повар (горячий цех)',
  'cook-cold': 'Повар (холодный цех)',
  'cook-universal': 'Повар-универсал',
  'prep': 'Заготовщик',
  'grill': 'Гриль / мангал',
  'wok': 'Вок-повар',
  'pizzaiolo': 'Пиццайоло',
  'sushi': 'Сушист',
  'shawarma': 'Шаурмист',
  'butcher': 'Мясник-обвальщик',
  'pastry': 'Кондитер',
  'baker': 'Пекарь',
  'dishwasher': 'Посудомойщик',
  'cleaner': 'Уборщик',
  'storekeeper': 'Кладовщик',
  'security': 'Охранник',
  'courier': 'Курьер',
  'catering': 'Кейтеринг',
  'dj': 'Диджей',
  'promoter': 'Промоутер',
};

export const roleName = (id: string) => ROLE_NAMES[id as GigCategory] ?? id;
