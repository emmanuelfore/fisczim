import { useActiveCompany } from "@/hooks/use-active-company";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConsignments } from "@/hooks/use-freight";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { format, parseISO } from "date-fns";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export default function FreightReportsPage() {
  const { activeCompanyId } = useActiveCompany(true);
  const { data: consignments, isLoading } = useConsignments(activeCompanyId || 0);

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading reports data...</div>;

  // Process data for Costs by Month
  const costsByMonthMap: Record<string, number> = {};
  
  // Process data for Costs by Forwarder
  const costsByForwarderMap: Record<string, number> = {};

  // Process data for Shipping Methods
  const methodsMap: Record<string, number> = {};

  consignments?.forEach((c: any) => {
    const cost = parseFloat(c.shippingCost || "0");
    if (cost > 0) {
      // By month
      if (c.actualArrivalDate || c.expectedArrivalDate || c.dispatchDate || c.createdAt) {
        const dateStr = c.actualArrivalDate || c.expectedArrivalDate || c.dispatchDate || c.createdAt;
        const month = format(parseISO(dateStr), 'MMM yyyy');
        costsByMonthMap[month] = (costsByMonthMap[month] || 0) + cost;
      }
      
      // By Forwarder
      const fName = c.forwarder?.name || "Unknown";
      costsByForwarderMap[fName] = (costsByForwarderMap[fName] || 0) + cost;
    }

    // By Method count
    const method = c.shippingMethod || "Unknown";
    methodsMap[method] = (methodsMap[method] || 0) + 1;
  });

  const costByMonthData = Object.entries(costsByMonthMap).map(([name, cost]) => ({ name, cost }));
  const costByForwarderData = Object.entries(costsByForwarderMap).map(([name, cost]) => ({ name, cost }));
  const methodData = Object.entries(methodsMap).map(([name, value]) => ({ name, value }));

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <PageHeader
        title="Freight Reports"
        subtitle="Analyze freight costs, transit times, and logistics performance"
      />
      <div className="p-6 max-w-7xl mx-auto w-full space-y-6 flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Freight Costs by Month</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                {costByMonthData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={costByMonthData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cost']} />
                      <Legend />
                      <Bar dataKey="cost" fill="#8884d8" name="Total Freight Cost" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-500">No data available</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Costs by Freight Forwarder</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                {costByForwarderData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={costByForwarderData} layout="vertical" margin={{ top: 20, right: 30, left: 40, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={100} />
                      <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cost']} />
                      <Legend />
                      <Bar dataKey="cost" fill="#82ca9d" name="Cost ($)" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-500">No data available</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Shipping Method Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                {methodData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={methodData}
                        cx="50%"
                        cy="50%"
                        labelLine={true}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {methodData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-500">No data available</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
