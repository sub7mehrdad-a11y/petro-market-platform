"""
آزمون هشت اصلاح فوری مرحله‌ی ۱ مغز (سند پروتکل بخش ۱۵-۵). هر اصلاح حداقل یک آزمون دارد.
اجرا:  python scripts/test_brain_fixes.py
بخش «سرتاسری» build_brain.py را روی داده‌ی واقعی مخزن (با تاریخ ثابت و خروجی در پوشه‌ی موقت) اجرا می‌کند؛ هیچ فایل مخزنی عوض نمی‌شود.
"""

import datetime
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import brain_core as core  # noqa: E402

BASE = os.path.dirname(HERE)
TODAY = datetime.date(2026, 11, 6)
RIVALS = ["ترکیه", "چین", "روسیه"]


class Fix1_CompetitionIncludesRussia(unittest.TestCase):
    def test_russia_share_reduces_competition_score(self):
        shares = {"روسیه": 0.30, "چین": 0.10, "ترکیه": 0.10, "ایران": 0.20, "دیگر": 0.30}
        score, rs, ir = core.competition_score(shares, RIVALS, "ازبکستان")
        self.assertAlmostEqual(rs, 0.50)
        self.assertAlmostEqual(score, 1 - 0.50 + 0.5 * 0.20)
        old, _, _ = core.competition_score(shares, ["ترکیه", "چین"], "ازبکستان")
        self.assertLess(score, old, "با روسیه، امتیاز رقابت پایین‌تر از فرمول قدیمی است")

    def test_country_is_not_its_own_rival(self):
        shares = {"روسیه": 0.5, "ایران": 0.5}
        score, rs, _ = core.competition_score(shares, RIVALS, "روسیه")
        self.assertEqual(rs, 0.0, "روسیه برای بازار روسیه رقیبِ سهم واردات نیست")
        self.assertGreater(score, 0.99)

    def test_score_is_clamped(self):
        score, _, _ = core.competition_score({"روسیه": 1.0}, RIVALS, "قزاقستان")
        self.assertEqual(score, 0.0)


class Fix2_SupplierShares(unittest.TestCase):
    def test_parse_share_from_note(self):
        p = core.parse_share_from_note
        self.assertEqual(p("سهم ۷۸.۷٪ (۸,۴۰۵ تن) — راستی‌آزمایی‌شده با ۴ منبع"), 78.7)
        self.assertEqual(p("سهم ۱۹.۲٪ (۲,۰۵۱ تن)؛ رشد ارزشی +۱,۲۲۰٪ نسبت به ۲۰۲۴؛ تعرفه‌ی ورودی ۵٪"), 19.2)
        self.assertEqual(p("رتبه اول تامین با ۴۸.۵٪ سهم بازار (۵,۳۳۳.۸ تن)"), 48.5)
        self.assertEqual(p("رتبه اول با ۵۳٫۳٪ سهم ارزشی و ۶۹۶ تن حجم واردات"), 53.3)
        self.assertIsNone(p("بدون سهم ثبت‌شده (۰٪) — بازار کاملاً بدون سابقه"), "سهم صفر/بدون سهم پذیرفته نمی‌شود")
        self.assertIsNone(p("رشد ۴۰٪ نسبت به سال قبل"), "درصد بدون کلمه‌ی سهم سهم نیست")
        self.assertIsNone(p(""))

    def test_priority_breakdown_then_mirror_then_notes(self):
        prof = {
            "report_import_breakdown": {"total_tons": 100, "suppliers": [{"country": "چین", "tons": 60}, {"country": "ایران", "tons": 40}]},
            "top_trade_partners": [{"country": "روسیه", "note": "سهم ۹۰٪"}],
        }
        mir = {"years": [{"year": 2023, "suppliers": [{"country_fa": "ترکیه", "share_pct": 70}]}, {"year": 2024, "suppliers": [{"country_fa": "هند", "share_pct": 55.5}]}]}
        s, src = core.resolve_supplier_shares(prof, mir)
        self.assertEqual(s, {"چین": 0.6, "ایران": 0.4})
        self.assertIn("تفکیک", src)
        s, src = core.resolve_supplier_shares({"top_trade_partners": prof["top_trade_partners"]}, mir)
        self.assertEqual(s, {"هند": 0.555}, "آخرین سالِ آمار آینه")
        self.assertIn("2024", src)
        s, src = core.resolve_supplier_shares({"top_trade_partners": prof["top_trade_partners"]}, None)
        self.assertEqual(s, {"روسیه": 0.9})
        self.assertIn("متن", src)
        self.assertEqual(core.resolve_supplier_shares({"top_trade_partners": []}, None), (None, None), "بدون هیچ منبع: نامشخص، نه حدس")


class Fix4_UnitValueIsNotFob(unittest.TestCase):
    def test_suspect_when_far_from_peers(self):
        peers = [252, 298, 320, 327, 369, 408, 429]
        self.assertTrue(core.unit_value_suspect(578, peers, 1.5))
        self.assertFalse(core.unit_value_suspect(429, peers, 1.5))
        self.assertTrue(core.unit_value_suspect(100, peers, 1.5), "خیلی پایین هم مشکوک است")
        self.assertFalse(core.unit_value_suspect(None, peers, 1.5))
        self.assertFalse(core.unit_value_suspect(578, [], 1.5))

    def test_median(self):
        self.assertEqual(core.median([3, None, 1, 2]), 2)
        self.assertIsNone(core.median([None]))


class Fix5_PastEvents(unittest.TestCase):
    def test_parse_event_end_formats(self):
        e = core.parse_event_end
        d = datetime.date
        self.assertEqual(e("۱۵ تا ۱۷ جولای ۲۰۲۶"), d(2026, 7, 17))
        self.assertEqual(e("جولای ۲۰۲۶"), d(2026, 7, 31))
        self.assertEqual(e("۷ و ۸ اکتبر ۲۰۲۶"), d(2026, 10, 8))
        self.assertEqual(e("۴ الی ۶ سپتامبر ۲۰۲۶"), d(2026, 9, 6))
        self.assertEqual(e("اوت (۴–۶ اوت ۲۰۲۶)"), d(2026, 8, 6))
        self.assertEqual(e("آوریل/مه (۲۷ آوریل–۱ مه ۲۰۲۶)"), d(2026, 5, 1))
        self.assertEqual(e("۲۸ سپتامبر تا ۱ اکتبر ۲۰۲۶"), d(2026, 10, 1))
        self.assertEqual(e("۱۳ تا ۱۵ آوریل ۲۰۲۷ (دوره اخیر: ۱ تا ۳ آوریل ۲۰۲۶)"), d(2027, 4, 15), "«دوره اخیر» مربوط به برگزاری قبلی است")
        self.assertEqual(e("۱۱ تا ۱۳ نوامبر ۲۰۲۶ (هم‌زمان با FoodExpo)"), d(2026, 11, 13))
        self.assertEqual(e("۲۸ دسامبر تا ۲ ژانویه ۲۰۲۷"), d(2027, 1, 2), "گذر از سال")
        self.assertIsNone(e("ژوئن/ژوئیه"), "بدون سال: نامعلوم")
        self.assertIsNone(e(""))
        self.assertIsNone(e("به‌زودی"))

    def test_status_relative_to_today(self):
        self.assertEqual(core.event_status("۴ الی ۶ اوت ۲۰۲۶", TODAY)[0], "past", "نمایشگاه اوت ۲۰۲۶ در ۶ نوامبر گذشته است")
        self.assertEqual(core.event_status("۹ تا ۱۲ نوامبر ۲۰۲۶", TODAY)[0], "upcoming")
        self.assertEqual(core.event_status("۳ تا ۵ نوامبر ۲۰۲۶", TODAY)[0], "past", "دیروز تمام شده")
        self.assertEqual(core.event_status("۴ تا ۶ نوامبر ۲۰۲۶", TODAY)[0], "upcoming", "آخرین روز همین امروز است")
        self.assertEqual(core.event_status("۶ نوامبر ۲۰۲۶", TODAY)[0], "upcoming", "امروز هنوز برگزار می‌شود")
        self.assertEqual(core.event_status("ژوئن/ژوئیه", TODAY)[0], "unknown")


class Fix6_IranCustoms(unittest.TestCase):
    def test_shamsi_span_is_gregorian_range(self):
        self.assertEqual(core.shamsi_span("1404"), ("2025-03-21", "2026-03-20"))
        self.assertEqual(core.shamsi_span(1402), ("2023-03-21", "2024-03-20"))


class Fix7_PricePeriods(unittest.TestCase):
    def test_all_period_formats_normalise(self):
        p = core.period_of
        self.assertEqual(p("June 2026")[:2], ("month", "2026-06"))
        self.assertEqual(p("2026-06")[:2], ("month", "2026-06"))
        self.assertEqual(p("Q2 2026")[:2], ("quarter", "2026-Q2"))
        self.assertEqual(p("2026-Q2")[:2], ("quarter", "2026-Q2"))
        self.assertEqual(p("2026-09-07")[:2], ("day", "2026-09-07"))
        self.assertEqual(p("September 2026")[:2], ("month", "2026-09"))
        self.assertEqual(p("نامعلوم")[0], "unknown")
        self.assertEqual(p(None)[0], "unknown")
        self.assertEqual(p("Q2 2026")[2], datetime.date(2026, 6, 30))
        self.assertEqual(p("2026-12")[2], datetime.date(2026, 12, 31))

    def test_same_period_different_spelling_is_same_label(self):
        self.assertEqual(core.period_of("June 2026")[1], core.period_of("2026-06")[1])

    def test_staleness(self):
        lim = {"month": 75, "quarter": 130, "day": 20}
        label, age, stale, kind = core.staleness("August 2026", TODAY, lim)
        self.assertEqual((label, age, stale, kind), ("2026-08", 67, False, "month"))
        _, age2, stale2, _ = core.staleness("2026-06", TODAY, lim)
        self.assertTrue(stale2 and age2 == 129, "ژوئن ۲۰۲۶ تا ۶ نوامبر: ۱۲۹ روز > ۷۵")
        self.assertTrue(core.staleness("Q2 2026", datetime.date(2026, 11, 6), lim)[2] is False, "فصل ۲: ۱۲۹ روز ≤ ۱۳۰")
        self.assertEqual(core.staleness("؟", TODAY, lim)[2], None)


class EndToEnd_RealData(unittest.TestCase):
    """build_brain.py را روی داده‌ی واقعی با تاریخ ثابت اجرا می‌کند و خروجی را در برابر هشت ایراد می‌سنجد."""

    @classmethod
    def setUpClass(cls):
        cls.out = tempfile.mkdtemp(prefix="brain-s1-")
        env = {**os.environ, "BRAIN_OUT_DIR": cls.out, "BRAIN_TODAY": TODAY.isoformat(), "PYTHONIOENCODING": "utf-8"}
        r = subprocess.run([sys.executable, os.path.join(HERE, "build_brain.py")], env=env, capture_output=True, text=True, encoding="utf-8")
        assert r.returncode == 0, r.stderr
        cls.digest = open(os.path.join(cls.out, "digest.md"), encoding="utf-8").read()
        cls.scores = json.load(open(os.path.join(cls.out, "country_scores.json"), encoding="utf-8"))
        cls.rows = {c["country"]: c for c in cls.scores["countries"]}
        cls.cfg = json.load(open(os.path.join(BASE, "data", "brain", "scoring_config.json"), encoding="utf-8"))
        cls.profiles = json.load(open(os.path.join(BASE, "data", "country_profiles.json"), encoding="utf-8"))

    def test_1_uzbekistan_no_longer_gets_full_competition_score(self):
        prof = self.profiles["ازبکستان"]
        sup = {s["country"]: s["tons"] for s in prof["report_import_breakdown"]["suppliers"]}
        total = prof["report_import_breakdown"]["total_tons"]
        old = 1 - (sup.get("ترکیه", 0) + sup.get("چین", 0)) / total + 0.5 * sup.get("ایران", 0) / total
        new = self.rows["ازبکستان"]["components"]["competition"]
        self.assertLess(new, old - 0.05, "روسیه (بزرگ‌ترین تأمین‌کننده) در رقابت حساب شده است")
        self.assertIn("روسیه", self.rows["ازبکستان"]["notes"]["competition"])

    def test_2_kazakhstan_shares_not_unknown(self):
        note = self.rows["قزاقستان"]["notes"]["competition"]
        self.assertNotIn("نامشخص", note)
        self.assertIn("متن شرکای پرونده", note)
        self.assertIn("سهم از متن پرونده", self.digest)
        for c in ("اردن", "کنیا", "ارمنستان"):
            self.assertIn("آمار آینه", self.rows[c]["notes"]["competition"], f"{c}: از آمار آینه")

    def test_3_company_pool_not_in_score(self):
        self.assertNotIn("company_pool", self.cfg["weights"])
        self.assertAlmostEqual(sum(self.cfg["weights"].values()), 1.0)
        for r in self.rows.values():
            self.assertNotIn("company_pool", r["components"])
            self.assertIn("pool_depth", r)
        self.assertIn("در امتیاز نیست", self.digest)

    def test_4_unit_value_flagged_and_labeled(self):
        kz = self.rows["قزاقستان"]
        self.assertIn("unit_value_suspect", kz["flags"])
        self.assertEqual(kz["components"]["price_room"], self.cfg["price_room"]["neutral_when_missing"])
        self.assertIn("مشکوک", kz["notes"]["price_room"])
        self.assertNotIn("ارزش واحد واردات بالا (نشانه‌ی سطح قیمت مقصد، نه فوب)", kz["strengths"], "عدد مشکوک مزیت نیست")
        self.assertIn("نه قیمت فوب", self.digest)
        self.assertNotIn("حاشیه‌ی قیمتی", self.digest, "برچسب گمراه‌کننده‌ی «حاشیه‌ی قیمتی» حذف شده")

    def test_5_only_upcoming_exhibitions_are_suggestable(self):
        lines = [l for l in self.digest.splitlines() if l.startswith("- نمایشگاه‌های پیش‌رو")]
        self.assertTrue(lines)
        for l in lines:
            for d in re.findall(r"پایان (\d{4}-\d{2}-\d{2})", l):
                self.assertGreaterEqual(datetime.date.fromisoformat(d), TODAY, f"نمایشگاه گذشته در پیشنهاد: {l[:90]}")
        self.assertIn("قابل‌پیشنهاد نیست", self.digest)

    def test_6_iran_customs_labelled(self):
        sec = self.digest.split("## ۳.")[1].split("## ۴.")[0]
        self.assertIn("کم‌اظهار", sec)
        self.assertIn("شمسی", sec)
        self.assertIn("هرگز به‌عنوان قیمت فوب", sec)
        self.assertRegex(sec, r"2025-03-21 تا 2026-03-20")

    def test_7_prices_have_standard_period_and_age(self):
        sec = self.digest.split("## ۲.")[1].split("## ۳.")[0]
        lines = [l for l in sec.splitlines() if l.startswith("- ") and "قیمت مرجع" not in l]
        self.assertTrue(lines)
        for l in lines:
            self.assertTrue("دوره‌ی داده" in l or "دوره‌ی نامشخص" in l, f"قیمت بدون دوره: {l[:80]}")
        self.assertRegex(sec, r"\d{4}-(\d{2}|Q\d)، \d+ روز پیش از امروز")

    def test_8_russia_is_ranked_and_flagged(self):
        self.assertIn("روسیه", self.rows)
        r = self.rows["روسیه"]
        self.assertIn("dual_role", r["flags"])
        self.assertIn("from_competitor_doc", r["flags"])
        self.assertEqual(r["raw"]["import_tons"], 20400)
        self.assertIn("proximity", [k for k in r["components"]])
        self.assertIn("فاصله/بندر", r["data_gaps"])
        self.assertIn("بازار و رقیب هم‌زمان", self.digest)

    def test_neutral_components_are_not_called_weak(self):
        r = self.rows["روسیه"]
        self.assertNotIn("دور از ایران", r["weaknesses"], "فاصله‌ی نامعلوم ضعف نیست")
        self.assertNotIn("نزدیک به ایران", r["strengths"])

    def test_digest_version_recorded_so_old_briefings_regenerate(self):
        self.assertTrue(self.scores.get("digest_version"), "نسخه‌ی خلاصه در خروجی ثبت می‌شود تا توصیه‌ی قدیمی دوباره ساخته شود")

    def test_ranking_complete_and_sorted(self):
        sc = [c["score"] for c in self.scores["countries"]]
        self.assertEqual(sc, sorted(sc, reverse=True))
        self.assertEqual([c["rank"] for c in self.scores["countries"]], list(range(1, len(sc) + 1)))
        self.assertNotIn("ترکیه", self.rows)


if __name__ == "__main__":
    unittest.main(verbosity=2)
