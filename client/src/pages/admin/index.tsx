import { useState } from "react";
import { Switch, Route, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { HierarchyBreadcrumb } from "@/components/admin/hierarchy-breadcrumb";
import { ThemeToggle } from "@/components/theme-toggle";
import { SyncNotificationCenter } from "@/components/sync-notification-center";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePosContext } from "@/lib/pos-context";
import type { Enterprise, Property, Rvc } from "@shared/schema";
import {
  Building2,
  Store,
  LayoutGrid,
  Users,
  UtensilsCrossed,
  Receipt,
  Monitor,
  ArrowLeft,
} from "lucide-react";

import EnterprisesPage from "./enterprises";
import PropertiesPage from "./properties";
import RvcsPage from "./rvcs";
import SlusPage from "./slus";
import MenuItemsPage from "./menu-items";
import ModifiersPage from "./modifiers";
import ModifierGroupsPage from "./modifier-groups";
import EmployeesPage from "./employees";
import RolesPage from "./roles";
import TaxGroupsPage from "./tax-groups";
import TendersPage from "./tenders";
import DiscountsPage from "./discounts";
import ServiceChargesPage from "./service-charges";
import PrintClassesPage from "./print-classes";
import OrderDevicesPage from "./order-devices";
import WorkstationsPage from "./workstations";
import PrintersPage from "./printers";
import KdsDevicesPage from "./kds-devices";
import PosLayoutsPage from "./pos-layouts";
import MajorGroupsPage from "./major-groups";
import FamilyGroupsPage from "./family-groups";
import UtilitiesPage from "./utilities";
import ReportsPage from "./reports";
import DevicesPage from "./devices";
import TimecardsPage from "./timecards";
import SchedulingPage from "./scheduling";
import LineUpPage from "./line-up";
import TipPoolingPage from "./tip-pooling";
import TimecardReportPage from "./timecard-report";
import LaborAnalyticsPage from "./labor-analytics";
import JobsPage from "./jobs";
import OvertimeRulesPage from "./overtime-rules";
import BreakRulesPage from "./break-rules";
import BreakMonitoringPage from "./break-monitoring";
import BreakViolationsPage from "./break-violations";
import MinorLaborPage from "./minor-labor";
import TipRulesPage from "./tip-rules";
import PaymentProcessorsPage from "./payment-processors";
import TerminalDevicesPage from "./terminal-devices";
import OnboardingPage from "./onboarding";
import GiftCardsPage from "./gift-cards";
import LoyaltyPage from "./loyalty";
import FiscalClosePage from "./fiscal-close";
import CashManagementPage from "./cash-management";
import OnlineOrderingPage from "./online-ordering";
import InventoryPage from "./inventory";
import ForecastingPage from "./forecasting";
import ManagerAlertsPage from "./manager-alerts";
import ItemAvailabilityPage from "./item-availability";
import AccountingExportPage from "./accounting-export";
import DailyOperationsPage from "./daily-operations";

function AdminDashboard() {
  const { data: stats } = useQuery<{
    enterprises: number;
    properties: number;
    rvcs: number;
    employees: number;
    menuItems: number;
    activeChecks: number;
  }>({
    queryKey: ["/api/admin/stats"],
  });

  const cards = [
    { title: "Enterprises", value: stats?.enterprises || 0, icon: Building2, href: "/admin/enterprises" },
    { title: "Properties", value: stats?.properties || 0, icon: Store, href: "/admin/properties" },
    { title: "Revenue Centers", value: stats?.rvcs || 0, icon: LayoutGrid, href: "/admin/rvcs" },
    { title: "Employees", value: stats?.employees || 0, icon: Users, href: "/admin/employees" },
    { title: "Menu Items", value: stats?.menuItems || 0, icon: UtensilsCrossed, href: "/admin/menu-items" },
    { title: "Active Checks", value: stats?.activeChecks || 0, icon: Receipt, href: "/admin/reports?tab=open-checks" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-admin-title">Administration Dashboard</h1>
        <p className="text-muted-foreground">Manage your POS configuration</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.title} href={card.href}>
              <Card className="hover-elevate cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {card.title}
                  </CardTitle>
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold tabular-nums">{card.value}</div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Link href="/admin/menu-items">
              <Button variant="outline" className="w-full justify-start">
                <UtensilsCrossed className="w-4 h-4 mr-2" />
                Manage Menu
              </Button>
            </Link>
            <Link href="/admin/employees">
              <Button variant="outline" className="w-full justify-start">
                <Users className="w-4 h-4 mr-2" />
                Manage Staff
              </Button>
            </Link>
            <Link href="/admin/order-devices">
              <Button variant="outline" className="w-full justify-start">
                <Monitor className="w-4 h-4 mr-2" />
                Configure KDS
              </Button>
            </Link>
            <Link href="/admin/tax-groups">
              <Button variant="outline" className="w-full justify-start">
                <Receipt className="w-4 h-4 mr-2" />
                Tax Settings
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">System Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Database</span>
              <span className="flex items-center gap-2 text-sm text-green-600">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                Connected
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">WebSocket</span>
              <span className="flex items-center gap-2 text-sm text-green-600">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                Active
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">KDS Sync</span>
              <span className="flex items-center gap-2 text-sm text-green-600">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                Real-time
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const [, navigate] = useLocation();
  const { currentEmployee, logout } = usePosContext();

  const { data: enterprises = [] } = useQuery<Enterprise[]>({
    queryKey: ["/api/enterprises"],
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const { data: rvcs = [] } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs"],
  });

  const [selectedEnterprise, setSelectedEnterprise] = useState<Enterprise | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [selectedRvc, setSelectedRvc] = useState<Rvc | null>(null);

  const handleEnterpriseChange = (id: string | null) => {
    const ent = enterprises.find((e) => e.id === id) || null;
    setSelectedEnterprise(ent);
    setSelectedProperty(null);
    setSelectedRvc(null);
  };

  const handlePropertyChange = (id: string | null) => {
    const prop = properties.find((p) => p.id === id) || null;
    setSelectedProperty(prop);
    setSelectedRvc(null);
  };

  const handleRvcChange = (id: string | null) => {
    const rvc = rvcs.find((r) => r.id === id) || null;
    setSelectedRvc(rvc);
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex h-screen w-full">
        <AdminSidebar onLogout={handleLogout} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between gap-4 px-4 py-2 border-b">
            <div className="flex items-center gap-2">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <Link href="/pos">
                <Button variant="ghost" size="sm" data-testid="button-back-pos">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to POS
                </Button>
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <SyncNotificationCenter
                propertyId={selectedProperty?.id}
                enterpriseId={selectedEnterprise?.id}
              />
              <ThemeToggle />
            </div>
          </header>

          <HierarchyBreadcrumb
            enterprises={enterprises}
            properties={properties}
            rvcs={rvcs}
            selectedEnterprise={selectedEnterprise}
            selectedProperty={selectedProperty}
            selectedRvc={selectedRvc}
            onEnterpriseChange={handleEnterpriseChange}
            onPropertyChange={handlePropertyChange}
            onRvcChange={handleRvcChange}
          />

          <main className="flex-1 overflow-auto">
            <Switch>
              <Route path="/admin/enterprises" component={EnterprisesPage} />
              <Route path="/admin/properties" component={PropertiesPage} />
              <Route path="/admin/rvcs" component={RvcsPage} />
              <Route path="/admin/slus" component={SlusPage} />
              <Route path="/admin/menu-items" component={MenuItemsPage} />
              <Route path="/admin/modifiers" component={ModifiersPage} />
              <Route path="/admin/modifier-groups" component={ModifierGroupsPage} />
              <Route path="/admin/employees" component={EmployeesPage} />
              <Route path="/admin/roles" component={RolesPage} />
              <Route path="/admin/tax-groups" component={TaxGroupsPage} />
              <Route path="/admin/tenders" component={TendersPage} />
              <Route path="/admin/payment-processors" component={PaymentProcessorsPage} />
              <Route path="/admin/discounts" component={DiscountsPage} />
              <Route path="/admin/service-charges" component={ServiceChargesPage} />
              <Route path="/admin/print-classes" component={PrintClassesPage} />
              <Route path="/admin/order-devices" component={OrderDevicesPage} />
              <Route path="/admin/workstations" component={WorkstationsPage} />
              <Route path="/admin/terminal-devices" component={TerminalDevicesPage} />
              <Route path="/admin/printers" component={PrintersPage} />
              <Route path="/admin/kds-devices" component={KdsDevicesPage} />
              <Route path="/admin/pos-layouts" component={PosLayoutsPage} />
              <Route path="/admin/major-groups" component={MajorGroupsPage} />
              <Route path="/admin/family-groups" component={FamilyGroupsPage} />
              <Route path="/admin/utilities" component={UtilitiesPage} />
              <Route path="/admin/reports" component={ReportsPage} />
              <Route path="/admin/daily-operations" component={DailyOperationsPage} />
              <Route path="/admin/devices" component={DevicesPage} />
              <Route path="/admin/timecards" component={TimecardsPage} />
              <Route path="/admin/scheduling" component={SchedulingPage} />
              <Route path="/admin/line-up" component={LineUpPage} />
              <Route path="/admin/tip-pooling" component={TipPoolingPage} />
              <Route path="/admin/timecard-report" component={TimecardReportPage} />
              <Route path="/admin/labor-analytics" component={LaborAnalyticsPage} />
              <Route path="/admin/jobs" component={JobsPage} />
              <Route path="/admin/overtime-rules" component={OvertimeRulesPage} />
              <Route path="/admin/break-rules" component={BreakRulesPage} />
              <Route path="/admin/break-monitoring" component={BreakMonitoringPage} />
              <Route path="/admin/break-violations" component={BreakViolationsPage} />
              <Route path="/admin/minor-labor" component={MinorLaborPage} />
              <Route path="/admin/tip-rules" component={TipRulesPage} />
              <Route path="/admin/onboarding" component={OnboardingPage} />
              <Route path="/admin/gift-cards" component={GiftCardsPage} />
              <Route path="/admin/loyalty" component={LoyaltyPage} />
              <Route path="/admin/fiscal-close" component={FiscalClosePage} />
              <Route path="/admin/cash-management" component={CashManagementPage} />
              <Route path="/admin/online-ordering" component={OnlineOrderingPage} />
              <Route path="/admin/inventory" component={InventoryPage} />
              <Route path="/admin/forecasting" component={ForecastingPage} />
              <Route path="/admin/manager-alerts" component={ManagerAlertsPage} />
              <Route path="/admin/item-availability" component={ItemAvailabilityPage} />
              <Route path="/admin/accounting-export" component={AccountingExportPage} />
              <Route path="/admin" component={AdminDashboard} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
