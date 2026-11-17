import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const m = vi.hoisted(() => ({ change: false, role: 'staff', count: 3 }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ userId: 'me', isAdmin: m.role !== 'staff', isMasterAdmin: m.role === 'master_admin', isManager: false, canEdit: (s: string) => s === 'orders' && m.change }) }));
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'es' }) }));
vi.mock('@/contexts/NavigationContext', () => ({ useNavigation: () => ({ registerBackHandler: () => {}, activePropertyId: null, setActivePropertyId: () => {} }) }));
vi.mock('@/components/ContentTranslation', () => ({ useContentTranslation: () => ({ text: (s: string) => s }), TranslationNotice: () => null }));
vi.mock('@/components/orders/requests/RequesterOrders', () => ({ RequesterOrders: ({ onMore, moreCount }: any) => <div><p>TILES</p>{onMore && <button onClick={onMore}>Más {moreCount > 0 ? moreCount : ''}</button>}</div> }));
vi.mock('@/components/orders/requests/RequestsQueue', () => ({ RequestsQueue: () => <p>QUEUE</p> }));
vi.mock('@/components/orders/library/OrderLibraryTab', () => ({ OrderLibraryTab: () => null }));
vi.mock('@/components/orders/PropertyShoppingLists', () => ({ PropertyShoppingLists: () => null }));
vi.mock('@/components/orders/houseFilter', () => ({ filterOrdersByHouse: (o: any) => o, orderCounts: () => ({ pending: 0, delivered: 0 }), useArrivalHouseFilter: () => [null, () => {}], HouseFilterChip: () => null }));
vi.mock('@/integrations/supabase/client', () => {
  const chain: any = new Proxy(function () {}, { get: (_t, k) => k === 'then' ? (r: any) => r({ data: [], error: null, count: m.count }) : () => chain, apply: () => chain });
  return { supabase: { from: () => chain, channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: () => {} } };
});
import { OrdersSection } from './OrdersSection';
const mount = (path = '/orders') => render(<MemoryRouter initialEntries={[path]}><QueryClientProvider client={new QueryClient()}><OrdersSection /></QueryClientProvider></MemoryRouter>);
describe('Orders home by Change permission', () => {
  beforeEach(() => { m.change = false; m.count = 3; });
  it.each(['staff', 'admin', 'master_admin'])('tiles first for %s', role => { m.role = role; m.change = role !== 'staff'; mount(); expect(screen.getByText('TILES')).toBeTruthy(); });
  it('no More without Change, even with more=1 in the link', () => { m.role = 'staff'; mount('/orders?more=1&view=requests'); expect(screen.getByText('TILES')).toBeTruthy(); expect(screen.queryByText(/Más/)).toBeNull(); expect(screen.queryByText('QUEUE')).toBeNull(); });
  it('More shows waiting count, opens management and Back returns', async () => {
    m.change = true; mount();
    await waitFor(() => expect(screen.getByText('Más 3')).toBeTruthy());
    fireEvent.click(screen.getByText('Más 3'));
    expect(screen.queryByText('TILES')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Volver/ }));
    expect(screen.getByText('TILES')).toBeTruthy();
  });
  it('badge hidden when zero', async () => { m.change = true; m.count = 0; mount(); await waitFor(() => expect(screen.getByText(/Más/).textContent?.trim()).toBe('Más')); });
  it('request notification link opens the queue for Change', () => { m.change = true; mount('/orders?more=1&view=requests&batch=b'); expect(screen.getByText('QUEUE')).toBeTruthy(); });
});
