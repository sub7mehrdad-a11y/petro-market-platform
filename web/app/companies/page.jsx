import { getCompanies } from "@/lib/data";
import CompaniesClient from "./CompaniesClient";

export default function CompaniesPage() {
  const companies = getCompanies();
  return <CompaniesClient companies={companies} />;
}
