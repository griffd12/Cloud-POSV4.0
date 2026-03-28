import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { useEmcFilter } from "@/lib/emc-context";
import { format, addDays, subDays } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { Loader2, TrendingUp, Users, DollarSign, Calendar, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import type { Property, SalesForecast, LaborForecast } from "@shared/schema";

export default function ForecastingPage() {
  const { toast } = useToast();
  usePosWebSocket();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId } = useEmcFilter();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(contextPropertyId || "");

  useEffect(() => {
    if (contextPropertyId) {
      setSelectedPropertyId(contextPropertyId);
    }
  }, [contextPropertyId]);
  const [forecastDate, setForecastDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  const { data: salesForecasts = [], isLoading: salesLoading } = useQuery<SalesForecast[]>({
    queryKey: ["/api/sales-forecasts", selectedPropertyId, forecastDate, filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/sales-forecasts?propertyId=${selectedPropertyId}&date=${forecastDate}${selectedEnterpriseId ? `&enterpriseId=${selectedEnterpriseId}` : ""}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch sales forecasts");
      return res.json();
    },
    enabled: !!selectedPropertyId,
  });

  const { data: laborForecasts = [], isLoading: laborLoading } = useQuery<LaborForecast[]>({
    queryKey: ["/api/labor-forecasts", selectedPropertyId, forecastDate, filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/labor-forecasts?propertyId=${selectedPropertyId}&date=${forecastDate}${selectedEnterpriseId ? `&enterpriseId=${selectedEnterpriseId}` : ""}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch labor forecasts");
      return res.json();
    },
    enabled: !!selectedPropertyId,
  });

  const generateForecastMutation = useMutation({
    mutationFn: async (data: { propertyId: string; startDate: string; endDate: string }) => {
      const res = await apiRequest("POST", "/api/sales-forecasts/generate", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-forecasts", selectedPropertyId, forecastDate, filterKeys] });
      queryClient.invalidateQueries({ queryKey: ["/api/labor-forecasts", selectedPropertyId, forecastDate, filterKeys] });
      toast({ title: "Forecast Generated", description: "Sales and labor forecasts have been generated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleGenerateForecast = () => {
    if (!selectedPropertyId) return;
    const startDate = forecastDate;
    const endDate = format(addDays(new Date(forecastDate), 6), "yyyy-MM-dd");
    generateForecastMutation.mutate({ propertyId: selectedPropertyId, startDate, endDate });
  };

  const navigateDate = (days: number) => {
    const newDate = addDays(new Date(forecastDate), days);
    setForecastDate(format(newDate, "yyyy-MM-dd"));
  };

  const formatCurrency = (value: string | null | undefined) => {
    if (!value) return "$0";
    return `$${parseFloat(value).toLocaleString()}`;
  };

  const currentForecast = salesForecasts.find(f => f.forecastDate === forecastDate);
  const currentLabor = laborForecasts.find(f => f.forecastDate === forecastDate);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Sales & Labor Forecasting</h1>
          <p className="text-muted-foreground">Project sales and labor needs based on historical data</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select Property</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4 flex-wrap">
          <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
            <SelectTrigger className="w-64" data-testid="select-property">
              <SelectValue placeholder="Select a property..." />
            </SelectTrigger>
            <SelectContent>
              {properties.map(prop => (
                <SelectItem key={prop.id} value={prop.id}>{prop.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigateDate(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Input
              type="date"
              value={forecastDate}
              onChange={(e) => setForecastDate(e.target.value)}
              className="w-40"
              data-testid="input-date"
            />
            <Button variant="outline" size="icon" onClick={() => navigateDate(1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {selectedPropertyId && (
            <Button onClick={handleGenerateForecast} disabled={generateForecastMutation.isPending} data-testid="button-generate">
              {generateForecastMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Generate Forecast
            </Button>
          )}
        </CardContent>
      </Card>

      {selectedPropertyId && (
        <Tabs defaultValue="sales" className="space-y-4">
          <TabsList>
            <TabsTrigger value="sales" data-testid="tab-sales">Sales Forecast</TabsTrigger>
            <TabsTrigger value="labor" data-testid="tab-labor">Labor Forecast</TabsTrigger>
          </TabsList>

          <TabsContent value="sales" className="space-y-4">
            {salesLoading ? (
              <Card><CardContent className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>
            ) : currentForecast ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Projected Sales
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold" data-testid="text-projected-sales">{formatCurrency(currentForecast.projectedSales)}</p>
                    {currentForecast.actualSales && (
                      <p className="text-sm text-muted-foreground mt-1">Actual: {formatCurrency(currentForecast.actualSales)}</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Projected Guests
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{currentForecast.projectedGuests || 0}</p>
                    {currentForecast.actualGuests && (
                      <p className="text-sm text-muted-foreground mt-1">Actual: {currentForecast.actualGuests}</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Confidence
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{currentForecast.confidence ? `${parseFloat(currentForecast.confidence).toFixed(0)}%` : "N/A"}</p>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No forecast data for this date. Click "Generate Forecast" to create projections.</CardContent></Card>
            )}

            {salesForecasts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Weekly Forecast</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Projected Sales</TableHead>
                        <TableHead className="text-right">Actual Sales</TableHead>
                        <TableHead className="text-right">Guests</TableHead>
                        <TableHead className="text-right">Checks</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesForecasts.map(forecast => (
                        <TableRow key={forecast.id} data-testid={`row-forecast-${forecast.id}`}>
                          <TableCell className="font-medium">{forecast.forecastDate}</TableCell>
                          <TableCell className="text-right">{formatCurrency(forecast.projectedSales)}</TableCell>
                          <TableCell className="text-right">{forecast.actualSales ? formatCurrency(forecast.actualSales) : "-"}</TableCell>
                          <TableCell className="text-right">{forecast.projectedGuests || "-"}</TableCell>
                          <TableCell className="text-right">{forecast.projectedChecks || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="labor" className="space-y-4">
            {laborLoading ? (
              <Card><CardContent className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>
            ) : currentLabor ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Hours Needed</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{currentLabor.totalHoursNeeded ? parseFloat(currentLabor.totalHoursNeeded).toFixed(1) : "0"}</p>
                    {currentLabor.actualHoursWorked && (
                      <p className="text-sm text-muted-foreground mt-1">Actual: {parseFloat(currentLabor.actualHoursWorked).toFixed(1)}</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Labor Cost</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{formatCurrency(currentLabor.projectedLaborCost)}</p>
                    {currentLabor.actualLaborCost && (
                      <p className="text-sm text-muted-foreground mt-1">Actual: {formatCurrency(currentLabor.actualLaborCost)}</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Target Labor %</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{currentLabor.targetLaborPercent ? `${parseFloat(currentLabor.targetLaborPercent).toFixed(1)}%` : "25%"}</p>
                    {currentLabor.actualLaborPercent && (
                      <p className="text-sm text-muted-foreground mt-1">Actual: {parseFloat(currentLabor.actualLaborPercent).toFixed(1)}%</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No labor forecast for this date.</CardContent></Card>
            )}

            {laborForecasts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Weekly Labor Forecast</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Hours Needed</TableHead>
                        <TableHead className="text-right">Actual Hours</TableHead>
                        <TableHead className="text-right">Projected Cost</TableHead>
                        <TableHead className="text-right">Target %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {laborForecasts.map(forecast => (
                        <TableRow key={forecast.id} data-testid={`row-labor-${forecast.id}`}>
                          <TableCell className="font-medium">{forecast.forecastDate}</TableCell>
                          <TableCell className="text-right">{forecast.totalHoursNeeded ? parseFloat(forecast.totalHoursNeeded).toFixed(1) : "-"}</TableCell>
                          <TableCell className="text-right">{forecast.actualHoursWorked ? parseFloat(forecast.actualHoursWorked).toFixed(1) : "-"}</TableCell>
                          <TableCell className="text-right">{formatCurrency(forecast.projectedLaborCost)}</TableCell>
                          <TableCell className="text-right">{forecast.targetLaborPercent ? `${parseFloat(forecast.targetLaborPercent).toFixed(1)}%` : "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
