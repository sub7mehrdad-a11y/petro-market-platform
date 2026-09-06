"""
تبدیل یک فایل docx به یک لیست ترتیبی از بلوک‌ها (heading/paragraph/table)،
دقیقاً به همون ترتیبی که در سند اومده‌ن.

چرا لازم بود: python-docx به‌صورت پیش‌فرض پاراگراف‌ها و جدول‌ها رو در دو لیست
جدا می‌ده (document.paragraphs و document.tables) و ترتیب واقعی‌شون توی سند رو
گم می‌کنه. این ماژول مستقیم از روی XML سند به ترتیب واقعی می‌خونه.

تشخیص heading: یا از روی استایل Word («Heading 1»، «Heading 2»...)، یا — چون
بعضی گزارش‌ها (مثل گزارش عراق/اردن) اصلاً از استایل Heading استفاده نکرده‌ن،
فقط عنوان‌ها رو bold کرده‌ن — با این قاعده: پاراگرافی که کاملاً bold و کوتاه
(کمتر از ۱۲ کلمه) باشه هم heading در نظر گرفته می‌شه.
"""

import docx
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph


def iter_block_items(document):
    """پاراگراف‌ها و جدول‌ها رو به ترتیب واقعی‌شون در سند yield می‌کنه."""
    body = document.element.body
    for child in body.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, document)
        elif child.tag == qn("w:tbl"):
            yield Table(child, document)


def _heading_level(paragraph: Paragraph):
    style_name = paragraph.style.name if paragraph.style else ""
    if style_name.startswith("Heading"):
        digits = "".join(ch for ch in style_name if ch.isdigit())
        return int(digits) if digits else 1

    text = paragraph.text.strip()
    if not text:
        return None
    is_fully_bold = bool(paragraph.runs) and all(
        r.bold for r in paragraph.runs if r.text.strip()
    )
    word_count = len(text.split())
    if is_fully_bold and word_count <= 12:
        return 2
    return None


def _paragraph_images(paragraph: Paragraph, document) -> list[dict]:
    """
    عکس‌های اینلاین توی یک پاراگراف رو برمی‌گردونه (بایت خام + content-type).

    چرا لازم بود: عکس‌ها به‌صورت <w:drawing> داخل یک <w:p> ذخیره می‌شن. قبلاً
    فقط item.text یک پاراگراف خونده می‌شد — پاراگرافی که فقط عکس داره (بدون
    متن) کاملاً نادیده گرفته می‌شد (چون text خالی بود و رد می‌شد)، برای همین
    عکس‌های گزارش‌ها هیچ‌وقت به نسخه‌ی وب راه پیدا نمی‌کردن.
    """
    images = []
    for blip in paragraph._element.findall(".//" + qn("a:blip")):
        r_id = blip.get(qn("r:embed"))
        if not r_id:
            continue
        try:
            part = document.part.related_parts[r_id]
        except KeyError:
            continue
        images.append({"bytes": part.blob, "content_type": part.content_type})
    return images


def _paragraph_runs(paragraph: Paragraph, document) -> list[dict]:
    """
    متن یک پاراگراف رو به ترتیب واقعی، به‌صورت لیستی از تکه‌ها برمی‌گردونه —
    هر تکه یا متن ساده‌ست (href=None) یا متن یک هایپرلینک (href=آدرس واقعی).

    چرا لازم بود: paragraph.text لینک‌ها رو به متن ساده تبدیل می‌کنه (آدرس
    واقعی گم می‌شه). بعضی گزارش‌ها (مثل گزارش خرده‌فروشی عراق) پر از لینک به
    صفحه‌ی محصول فروشگاه‌ها و عکس محصولن — این‌ها باید توی وب کلیک‌پذیر بمونن.
    فقط وقتی حداقل یک لینک واقعی توی پاراگراف باشه یک لیست غیر خالی برمی‌گرده؛
    برای پاراگراف‌های معمولی (اکثریت قریب‌به‌اتفاق گزارش‌ها) خروجی خالیه تا
    parsed JSON بی‌جهت بزرگ نشه.
    """
    runs = []
    has_link = False
    for child in paragraph._element:
        if child.tag == qn("w:r"):
            text = "".join(t.text or "" for t in child.findall(".//" + qn("w:t")))
            if text:
                runs.append({"text": text, "href": None})
        elif child.tag == qn("w:hyperlink"):
            text = "".join(t.text or "" for t in child.findall(".//" + qn("w:t")))
            r_id = child.get(qn("r:id"))
            href = None
            if r_id:
                try:
                    href = document.part.rels[r_id].target_ref
                except KeyError:
                    href = None
            if text:
                runs.append({"text": text, "href": href})
                has_link = has_link or bool(href)
    return runs if has_link else []


def extract_blocks(path: str) -> list[dict]:
    document = docx.Document(path)
    blocks = []

    for item in iter_block_items(document):
        if isinstance(item, Paragraph):
            for img in _paragraph_images(item, document):
                blocks.append({"type": "image", **img})

            text = item.text.strip()
            if not text:
                continue
            level = _heading_level(item)
            if level:
                blocks.append({"type": "heading", "level": level, "text": text})
            else:
                is_list = (item.style.name if item.style else "").startswith("List")
                block = {"type": "list_item" if is_list else "paragraph", "text": text}
                runs = _paragraph_runs(item, document)
                if runs:
                    block["runs"] = runs
                blocks.append(block)
        elif isinstance(item, Table):
            headers = [c.text.strip() for c in item.rows[0].cells] if item.rows else []
            rows = [[c.text.strip() for c in row.cells] for row in item.rows[1:]]
            blocks.append({"type": "table", "headers": headers, "rows": rows})

    return blocks


def extract_plain_text(path: str) -> str:
    """برای دادن به مدل: فقط متن، بدون تفکیک نوع بلوک؛ جدول‌ها هم به شکل خط‌به‌خط میان."""
    blocks = extract_blocks(path)
    lines = []
    for b in blocks:
        if b["type"] == "image":
            continue  # مدل به بایت عکس نیازی نداره، فقط برای نسخه‌ی وب لازمه
        if b["type"] == "table":
            lines.append(" | ".join(b["headers"]))
            for row in b["rows"]:
                lines.append(" | ".join(row))
        else:
            lines.append(b["text"])
    return "\n".join(lines)
