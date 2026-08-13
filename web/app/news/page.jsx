import { getNewsAnalysis } from "@/lib/data";
import NewsClient from "./NewsClient";

export default function NewsPage() {
  const entries = getNewsAnalysis();
  return <NewsClient entries={entries} />;
}
