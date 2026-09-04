"""Customer/Contractor profile PDF generator — full 39-field detail card."""
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors as rl_colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

COMPANY = "TRIVENI DSC AND ETENDER SERVICE PVT. LTD"


def _kv(label, value):
    return [Paragraph(f"<b>{label}</b>", _lbl), Paragraph(str(value) if value not in (None, "", "NA") else "—", _val)]


_styles = getSampleStyleSheet()
_body = ParagraphStyle("body", parent=_styles["BodyText"], fontName="Helvetica", fontSize=9, leading=11)
_lbl = ParagraphStyle("lbl", parent=_body, textColor=rl_colors.HexColor("#475569"), fontSize=8)
_val = ParagraphStyle("val", parent=_body, fontName="Helvetica-Bold", fontSize=9)
_h1 = ParagraphStyle("h1", parent=_body, fontName="Helvetica-Bold", fontSize=15, textColor=rl_colors.HexColor("#0F172A"))
_h2 = ParagraphStyle("h2", parent=_body, fontName="Helvetica-Bold", fontSize=11, textColor=rl_colors.white)
_sec = ParagraphStyle("sec", parent=_body, fontName="Helvetica-Bold", fontSize=10, textColor=rl_colors.HexColor("#1E40AF"))


def _section(title):
    t = Table([[Paragraph(title, _h2)]], colWidths=[186 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), rl_colors.HexColor("#1E40AF")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def _grid(pairs):
    """pairs: [(label,value), ...] rendered as 2-column table."""
    rows = []
    row = []
    for kv in pairs:
        row.append(_kv(kv[0], kv[1]))
        if len(row) == 2:
            rows.append([row[0][0], row[0][1], row[1][0], row[1][1]])
            row = []
    if row:
        rows.append([row[0][0], row[0][1], "", ""])
    tbl = Table(rows, colWidths=[35 * mm, 60 * mm, 35 * mm, 56 * mm])
    tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.3, rl_colors.HexColor("#CBD5E1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.2, rl_colors.HexColor("#E2E8F0")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return tbl


def build_customer_pdf(c: dict) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=12 * mm, rightMargin=12 * mm, topMargin=10 * mm, bottomMargin=10 * mm)
    elems = []

    # Header
    hdr = Table([[
        [Paragraph(COMPANY, _h1), Paragraph("Contractor / Customer Profile", _sec)],
        [Paragraph(f"<b>ID:</b> {c.get('customer_code') or '—'}", _val),
         Paragraph(f"<b>Created:</b> {str(c.get('created_at') or '')[:10]}", _body)],
    ]], colWidths=[120 * mm, 66 * mm])
    hdr.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elems.append(hdr)
    elems.append(Spacer(1, 8))

    # Section 1: Personal / Contact
    elems.append(_section("PERSONAL & CONTACT DETAILS"))
    elems.append(_grid([
        ("Contractor Name", c.get("name")),
        ("Father / Guardian", c.get("father_name")),
        ("Mobile No.", c.get("mobile")),
        ("WhatsApp No.", c.get("whatsapp")),
        ("Email", c.get("email")),
        ("Alt Mobile", c.get("alt_mobile")),
        ("Date of Birth", c.get("date_of_birth")),
        ("Gender", c.get("gender")),
    ]))
    elems.append(Spacer(1, 6))

    # Section 2: Address
    elems.append(_section("ADDRESS"))
    elems.append(_grid([
        ("Address", c.get("address")),
        ("City", c.get("city")),
        ("District", c.get("district")),
        ("State", c.get("state")),
        ("Pincode", c.get("pincode")),
        ("Country", c.get("country") or "India"),
    ]))
    elems.append(Spacer(1, 6))

    # Section 3: Identity / KYC
    elems.append(_section("KYC & IDENTITY"))
    elems.append(_grid([
        ("PAN No.", c.get("pan")),
        ("Aadhar No.", c.get("aadhar")),
        ("Voter ID", c.get("voter_id")),
        ("Driving Licence", c.get("driving_licence")),
        ("Passport No.", c.get("passport_no")),
        ("GSTIN", c.get("gst_no")),
    ]))
    elems.append(Spacer(1, 6))

    # Section 4: Business / Registration
    elems.append(_section("BUSINESS & REGISTRATION"))
    elems.append(_grid([
        ("Firm Name", c.get("firm_name")),
        ("Firm Type", c.get("firm_type")),
        ("Contractor Reg. No.", c.get("contractor_reg_no")),
        ("Registration Date", c.get("registration_date")),
        ("Registration Validity", c.get("registration_validity")),
        ("Registration Authority", c.get("registration_authority")),
        ("Class / Category", c.get("contractor_class")),
        ("PWD / Dept.", c.get("department")),
    ]))
    elems.append(Spacer(1, 6))

    # Section 5: Banking
    elems.append(_section("BANKING DETAILS"))
    elems.append(_grid([
        ("Bank Name", c.get("bank_name")),
        ("Branch", c.get("bank_branch")),
        ("Account No.", c.get("bank_account_no")),
        ("IFSC Code", c.get("bank_ifsc")),
        ("Account Holder", c.get("account_holder_name")),
        ("Account Type", c.get("bank_account_type")),
    ]))
    elems.append(Spacer(1, 6))

    # Section 6: DSC / Digital
    elems.append(_section("DSC / DIGITAL SIGNATURE"))
    elems.append(_grid([
        ("DSC Serial No.", c.get("dsc_serial_no")),
        ("DSC Issue Date", c.get("dsc_issue_date")),
        ("DSC Expiry", c.get("dsc_expiry")),
        ("DSC Class", c.get("dsc_class")),
        ("Certificate Authority", c.get("dsc_ca")),
        ("Token / Hardware", c.get("dsc_token")),
    ]))
    elems.append(Spacer(1, 6))

    # Section 7: Notes / Remarks
    if c.get("remarks") or c.get("notes"):
        elems.append(_section("NOTES / REMARKS"))
        note = c.get("remarks") or c.get("notes") or "—"
        elems.append(Table([[Paragraph(note, _body)]], colWidths=[186 * mm],
                          style=TableStyle([
                              ("BOX", (0, 0), (-1, -1), 0.3, rl_colors.HexColor("#CBD5E1")),
                              ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                              ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                          ])))

    elems.append(Spacer(1, 10))
    elems.append(Paragraph(f"<b>Generated by:</b> {COMPANY} • This is a system-generated profile document.", _lbl))

    doc.build(elems)
    return buf.getvalue()
