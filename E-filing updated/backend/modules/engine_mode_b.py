from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, cm
import io

def generate_mode_b_document(data: dict) -> io.BytesIO:
    template_type = data.get("template_type", "jmfc")
    
    packet = io.BytesIO()
    c = canvas.Canvas(packet, pagesize=A4)
    width, height = A4

    # Check for Stamp Paper Space
    is_stamp_paper = data.get("is_stamp_paper", False)
    top_offset = 4.5 * inch if is_stamp_paper else 1.5 * inch
    start_y = height - top_offset
    
    c.setFont("Times-Roman", 12)
    
    if template_type == "jmfc":
        # 1. JMFC Application Template
        c.setFont("Times-Bold", 14)
        c.drawCentredString(width / 2.0, start_y, "IN THE COURT OF ADDL. J.M.F.C. ________________ COURT, AT MUMBAI")
        
        c.setFont("Times-Roman", 12)
        c.drawCentredString(width / 2.0, start_y - 20, f"C.C. / C.R. NO. {data.get('case_number', '_______________')} / 20__")
        
        c.drawString(1 * inch, start_y - 60, f"{data.get('complainant', '_____________________')} ) ... Complainant")
        c.drawCentredString(width / 2.0, start_y - 80, "VERSUS")
        c.drawString(1 * inch, start_y - 100, f"{data.get('accused', '_____________________')} ) ... Accused")
        
        c.setFont("Times-Bold", 12)
        c.drawString(1 * inch, start_y - 140, "MAY IT PLEASE YOUR HONOUR:")
        c.setFont("Times-Roman", 12)
        c.drawString(1 * inch, start_y - 160, "It is most respectfully submitted on behalf of the Complainant/Accused as under ->")
        
        c.drawString(1.5 * inch, start_y - 190, data.get('content_line_1', '_____________________________________________________'))
        c.drawString(1.5 * inch, start_y - 215, data.get('content_line_2', '_____________________________________________________'))
        
        c.drawString(1 * inch, start_y - 260, f"Place: {data.get('place', 'Mumbai')} | Date: {data.get('date', '___ Day of ______, 20__')}")
        c.drawString(1 * inch, start_y - 300, "Advocate for the Complainant/Accused")

    elif template_type == "vakalatnama":
        # 2. Standard Vakalatnama Draft
        c.setFont("Times-Bold", 16)
        c.drawCentredString(width / 2.0, start_y, "VAKALATNAMA")
        
        c.setFont("Times-Roman", 12)
        c.drawString(1 * inch, start_y - 40, f"IN THE COURT OF: {data.get('court_name', '_____________________________')}")
        
        text = f"Know all to whom these Present shall come that I/we {data.get('client_name', '________________')} do hereby "
        text2 = f"appoint {data.get('advocate_name', '________________')} to be my/our Advocate in the above-noted case."
        
        c.drawString(1 * inch, start_y - 80, text)
        c.drawString(1 * inch, start_y - 100, text2)
        
        c.drawRightString(width - 1*inch, start_y - 200, "SIGNATURE OF EXECUTANT(S)")
        c.drawString(1 * inch, start_y - 200, "ACCEPTED BY ME (ADVOCATE)")

    c.save()
    packet.seek(0)
    return packet
