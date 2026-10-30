import { useFiscalAuthority } from "@/hooks/use-fiscal-authority";
import MainDashboard from "./dashboard/main-dashboard";
import LekakuDashboard from "./dashboard/lekaku-dashboard";

export default function Dashboard() {
  const { isLesotho } = useFiscalAuthority();
  return isLesotho ? <LekakuDashboard /> : <MainDashboard />;
}
