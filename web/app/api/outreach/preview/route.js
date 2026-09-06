import { NextResponse } from "next/server";
import { getCompanies, getCountryEnglishName } from "@/lib/data";
import { renderOutreachEmail, gradeLabelFa } from "@/lib/outreachTemplate";

export async function POST(request) {
  let companyIds;
  try {
    ({ companyIds } = await request.json());
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }
  if (!Array.isArray(companyIds) || companyIds.length === 0) {
    return NextResponse.json({ error: "هیچ شرکتی انتخاب نشده." }, { status: 400 });
  }

  const byId = new Map(getCompanies().map((c) => [c.id, c]));

  const previews = companyIds.slice(0, 10).map((id) => {
    const c = byId.get(id);
    if (!c) return { id, error: "شرکت پیدا نشد" };
    const rendered = renderOutreachEmail({
      english_name: c.english_name,
      country: c.country,
      country_en: getCountryEnglishName(c.country),
      target_grade: c.target_grade,
    });
    return {
      id,
      english_name: c.english_name,
      email: c.email,
      grade: rendered.grade,
      grade_label_fa: gradeLabelFa(rendered.grade),
      subject: rendered.subject,
      body: rendered.body,
      attachments: rendered.attachments,
    };
  });

  return NextResponse.json({ previews, truncated: companyIds.length > 10 });
}
