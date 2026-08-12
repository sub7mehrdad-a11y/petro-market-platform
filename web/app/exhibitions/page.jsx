import { getExhibitions } from "@/lib/data";
import ExhibitionsClient from "./ExhibitionsClient";

export default function ExhibitionsPage() {
  const exhibitions = getExhibitions();
  return <ExhibitionsClient exhibitions={exhibitions} />;
}
