import {
  getCountries, getCountrySummary, getTradeMapForCountry, getCountryProfile,
} from "@/lib/data";
import CountriesClient from "./CountriesClient";

export default function CountriesPage() {
  const countries = getCountries().map((name) => {
    const { companies, exhibitions, reports } = getCountrySummary(name);
    const profile = getCountryProfile(name);
    return {
      name,
      companies: companies.length,
      exhibitions: exhibitions.length,
      reports: reports.length,
      trade: getTradeMapForCountry(name),
      partners: profile?.top_trade_partners || [],
      hasProfile: !!profile,
    };
  });

  return <CountriesClient countries={countries} />;
}
