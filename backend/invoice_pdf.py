"""Invoice PDF generation matching the TDSC reference layout."""
from io import BytesIO
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors as rl_colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER

# ---- Company constants (as per reference PDF) ------------------------
COMPANY = {
    "name": "TRIVENI DSC AND ETENDER SERVICE PVT. LTD",
    "address_l1": "MOH-BHAISHASUR HOSPITAL MORE NEAR EYE CARE HOSPITAL SRI",
    "address_l2": "DILCHANDRA MAHTO WARD NO-17 RANCHI ROAD BIHARSHARIF",
    "phone": "9334344708",
    "email": "tdscservice@gmail.com",
    "gstin": "10AAGCT3865R1ZU",
    "state": "10-Bihar",
}
BANK = {
    "name": "STATE BANK OF INDIA, SME BIHARSHARIFF",
    "account_no": "42137607814",
    "ifsc": "SBIN0063706",
    "holder": "TRIVENI DSC AND E TENDER SERVICE PVT.LTD",
}
SIGNATORY = "अंजू कुमारी"


# ---- Number to Indian words helper -----------------------------------
_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
         "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
         "Seventeen", "Eighteen", "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _two(n: int) -> str:
    if n < 20: return _ONES[n]
    return _TENS[n // 10] + (" " + _ONES[n % 10] if n % 10 else "")


def _three(n: int) -> str:
    if n >= 100:
        return _ONES[n // 100] + " Hundred" + ((" " + _two(n % 100)) if n % 100 else "")
    return _two(n)


def number_to_indian_words(n: float) -> str:
    n = int(round(n))
    if n == 0: return "Zero Rupees only"
    parts = []
    crore = n // 10000000; n %= 10000000
    lakh = n // 100000; n %= 100000
    thousand = n // 1000; n %= 1000
    hundred = n
    if crore: parts.append(_two(crore) + " Crore")
    if lakh: parts.append(_two(lakh) + " Lakh")
    if thousand: parts.append(_two(thousand) + " Thousand")
    if hundred: parts.append(_three(hundred))
    return " ".join(parts).strip() + " Rupees only"


# ---- Table helpers --------------------------------------------------
def _rupee(amt: float) -> str:
    return f"₹ {amt:,.2f}"


def build_invoice_pdf(inv: dict, customer: dict | None = None) -> bytes:
    """Return PDF bytes for a Sale Invoice dict."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=12 * mm, rightMargin=12 * mm,
        topMargin=10 * mm, bottomMargin=10 * mm,
    )

    styles = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=styles["BodyText"], fontName="Helvetica", fontSize=9, leading=11)
    small = ParagraphStyle("small", parent=body, fontSize=8, leading=10)
    company_hdr = ParagraphStyle("ch", parent=body, fontName="Helvetica-Bold", fontSize=13, leading=15, textColor=rl_colors.HexColor("#0F172A"))
    doc_title = ParagraphStyle("dt", parent=body, fontName="Helvetica-Bold", fontSize=16, leading=18, alignment=TA_RIGHT, textColor=rl_colors.HexColor("#0F172A"))
    lbl_right = ParagraphStyle("lr", parent=small, alignment=TA_RIGHT)
    lbl_left = ParagraphStyle("ll", parent=small, alignment=TA_LEFT)
    bill_to = ParagraphStyle("bt", parent=body, fontName="Helvetica-Bold", fontSize=10, backColor=rl_colors.HexColor("#EEF2FF"), borderPadding=4)

    elems = []

    # -------- Header: company (left) vs Tax Invoice + meta (right) ----
    left_cell = [
        Paragraph(COMPANY["name"], company_hdr),
        Paragraph(COMPANY["address_l1"], small),
        Paragraph(COMPANY["address_l2"], small),
        Paragraph(f"<b>Phone no.:</b> {COMPANY['phone']}", small),
        Paragraph(f"<b>Email:</b> {COMPANY['email']}", small),
        Paragraph(f"<b>GSTIN:</b> {COMPANY['gstin']}", small),
        Paragraph(f"<b>State:</b> {COMPANY['state']}", small),
    ]
    meta_rows = [
        ["Invoice No.", str(inv.get("invoice_no") or "-")],
        ["Place of Supply", COMPANY["state"]],
        ["Date", inv.get("date") or "-"],
        ["Due Date", inv.get("due_date") or inv.get("date") or "-"],
    ]
    meta_tbl = Table(meta_rows, colWidths=[28 * mm, 40 * mm])
    meta_tbl.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("TEXTCOLOR", (0, 0), (0, -1), rl_colors.HexColor("#475569")),
    ]))
    right_cell = [Paragraph("Tax Invoice", doc_title), Spacer(1, 4), meta_tbl]

    header_tbl = Table([[left_cell, right_cell]], colWidths=[110 * mm, 76 * mm])
    header_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    elems.append(header_tbl)
    elems.append(Spacer(1, 8))

    # -------- Bill To ----------------------------------------------------
    elems.append(Paragraph("Bill To", bill_to))
    bill_lines = [
        Paragraph(f"<b>{inv.get('party_name') or '-'}</b>", body),
    ]
    if customer:
        addr = customer.get("address") or ""
        if addr:
            bill_lines.append(Paragraph(addr, small))
    if inv.get("party_mobile"):
        bill_lines.append(Paragraph(f"<b>Contact No.:</b> {inv['party_mobile']}", small))
    if inv.get("party_gst"):
        bill_lines.append(Paragraph(f"<b>GSTIN:</b> {inv['party_gst']}", small))
    bill_lines.append(Paragraph(f"<b>State:</b> {COMPANY['state']}", small))
    elems.append(Table([[bill_lines]], colWidths=[186 * mm], style=TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.4, rl_colors.HexColor("#CBD5E1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ])))
    elems.append(Spacer(1, 6))

    # -------- Items table -----------------------------------------------
    items = inv.get("items") or []
    header = ["#", "Item name", "HSN/SAC", "Quantity", "Price / Unit", "Amount"]
    rows = [header]
    total_qty = 0.0
    subtotal = 0.0
    for i, it in enumerate(items, 1):
        qty = float(it.get("qty") or 0)
        price = float(it.get("price") or 0)
        amt = float(it.get("amount") or 0)
        if amt == 0:
            after = max(0.0, qty * price - float(it.get("discount") or 0))
            amt = round(after * (1 + float(it.get("tax_rate") or 0) / 100.0), 2)
        total_qty += qty
        subtotal += amt
        rows.append([
            str(i), Paragraph(str(it.get("name") or ""), body),
            str(it.get("hsn_sac") or ""), f"{qty:g}",
            _rupee(price), _rupee(amt),
        ])
    if not items:
        rows.append(["1", Paragraph("Services", body), "", "1", _rupee(inv.get("total_amount") or 0), _rupee(inv.get("total_amount") or 0)])
        total_qty = 1
        subtotal = float(inv.get("total_amount") or 0)
    # Total row
    rows.append(["", Paragraph("<b>Total</b>", body), "", f"{total_qty:g}", "", _rupee(subtotal or float(inv.get("total_amount") or 0))])
    items_tbl = Table(rows, colWidths=[8 * mm, 66 * mm, 22 * mm, 22 * mm, 32 * mm, 36 * mm], repeatRows=1)
    items_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), rl_colors.HexColor("#0F172A")),
        ("TEXTCOLOR", (0, 0), (-1, 0), rl_colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (3, 0), (5, -1), "RIGHT"),
        ("ALIGN", (2, 0), (2, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.3, rl_colors.HexColor("#CBD5E1")),
        ("BACKGROUND", (0, -1), (-1, -1), rl_colors.HexColor("#F1F5F9")),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
    ]))
    elems.append(items_tbl)
    elems.append(Spacer(1, 6))

    # -------- Amount in Words + Amounts table (side by side) -----------
    total = float(inv.get("total_amount") or 0)
    paid = float(inv.get("paid_amount") or 0)
    balance = float(inv.get("balance") or 0)
    if not balance and total: balance = round(total - paid, 2)
    amounts_rows = [
        ["Sub Total", _rupee(total - float(inv.get("total_tax") or 0))],
        ["Total", _rupee(total)],
        ["Received", _rupee(paid)],
        ["Balance", _rupee(balance)],
    ]
    amounts_tbl = Table(amounts_rows, colWidths=[35 * mm, 40 * mm])
    amounts_tbl.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEABOVE", (0, 1), (-1, 1), 0.3, rl_colors.HexColor("#CBD5E1")),
        ("LINEABOVE", (0, 3), (-1, 3), 0.4, rl_colors.HexColor("#0F172A")),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
        ("FONTNAME", (0, 3), (-1, 3), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 3), (-1, 3), rl_colors.HexColor("#DC2626")),
    ]))
    words_para = Paragraph(
        f"<b>Invoice Amount In Words</b><br/>{number_to_indian_words(total)}",
        body,
    )
    words_tbl = Table([[words_para, amounts_tbl]], colWidths=[110 * mm, 76 * mm])
    words_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    elems.append(words_tbl)
    elems.append(Spacer(1, 8))

    # -------- Notes + Terms + Signatory --------------------------------
    notes = inv.get("notes") or ""
    payment_type = (inv.get("payment_type") or "").upper()
    payment_mode = (inv.get("payment_mode") or "cash").replace("_", " ").title()
    desc_lines = [Paragraph("<b>Description</b>", small)]
    desc_lines.append(Paragraph(f"<b>Payment Mode:</b> {payment_mode}", small))
    if payment_type == "CASH":
        desc_lines.append(Paragraph("By Cash Denomination :-", small))
        try:
            n500 = int(paid // 500)
            if n500:
                desc_lines.append(Paragraph(f"By Cash - 500 x {n500}", small))
        except Exception:
            pass
    if notes:
        desc_lines.append(Paragraph(notes, small))

    terms_lines = [
        Paragraph("<b>Terms and conditions</b>", small),
        Paragraph("Thanks for doing business with us!", small),
    ]
    signatory_lines = [
        Paragraph(f"For: <b>{COMPANY['name']}</b>", small),
        Spacer(1, 30),
        Paragraph(SIGNATORY, ParagraphStyle("sig", parent=body, fontName="Helvetica-Bold", fontSize=11, alignment=TA_RIGHT)),
        Paragraph("Authorized Signatory", ParagraphStyle("sig2", parent=small, alignment=TA_RIGHT)),
    ]
    bottom_tbl = Table([[desc_lines, terms_lines, signatory_lines]],
                      colWidths=[70 * mm, 55 * mm, 61 * mm])
    bottom_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.3, rl_colors.HexColor("#CBD5E1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, rl_colors.HexColor("#E2E8F0")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elems.append(bottom_tbl)
    elems.append(Spacer(1, 6))

    # -------- Bank details ---------------------------------------------
    bank_para = [
        Paragraph("<b>Bank Details</b>", small),
        Paragraph(f"<b>Name:</b> {BANK['name']}", small),
        Paragraph(f"<b>Account No.:</b> {BANK['account_no']}", small),
        Paragraph(f"<b>IFSC code:</b> {BANK['ifsc']}", small),
        Paragraph(f"<b>Account Holder's Name:</b> {BANK['holder']}", small),
    ]
    bank_tbl = Table([[bank_para]], colWidths=[186 * mm])
    bank_tbl.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.4, rl_colors.HexColor("#CBD5E1")),
        ("BACKGROUND", (0, 0), (-1, -1), rl_colors.HexColor("#F8FAFC")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elems.append(bank_tbl)

    doc.build(elems)
    return buf.getvalue()
