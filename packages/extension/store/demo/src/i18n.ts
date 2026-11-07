export const locale = navigator.language;

const arabic = {
  bean: 'إثيوبيا غوجي، 250 غ',
  brand: 'قهوة فيرنوود',
  chart: 'مبيعات هذا الأسبوع',
  customers: 'العملاء',
  dashboard: 'لوحة التحكم',
  fromLastWeek: 'عن الأسبوع الماضي',
  hello: 'صباح الخير يا لينا',
  inStore: 'في المتجر',
  live: 'طلبات مباشرة',
  menu: 'القائمة',
  online: 'عبر الإنترنت',
  orders: 'الطلبات',
  pickup: 'أقرب نقطة استلام',
  products: 'المنتجات',
  reorder: 'إعادة طلب المخزون',
  returning: 'عملاء عائدون',
  revenue: 'إيرادات اليوم',
  sold: '148 مبيعا هذا الأسبوع',
  top: 'الأكثر مبيعا',
};

const english: typeof arabic = {
  bean: 'Ethiopia Guji, 250 g',
  brand: 'Fernwood Coffee',
  chart: 'Sales this week',
  customers: 'Customers',
  dashboard: 'Dashboard',
  fromLastWeek: 'from last week',
  hello: 'Good morning, Lena',
  inStore: 'In store',
  live: 'Live orders',
  menu: 'Menu',
  online: 'Online',
  orders: 'Orders',
  pickup: 'Nearest pickup',
  products: 'Products',
  reorder: 'Reorder stock',
  returning: 'Returning customers',
  revenue: 'Revenue today',
  sold: '148 sold this week',
  top: 'Top seller',
};

export const isArabic = locale.startsWith('ar');
export const t = isArabic ? arabic : english;
