import streamlit as st
import requests
import os
from dotenv import load_dotenv
import time
import json
from datetime import datetime

# Load environment variables from a .env file into the system's environment
# This is a best practice to keep secrets (like API keys and URLs) out of source code
load_dotenv()

# We fetch the backend URL from environment variables, defaulting to a production URL if not set
BACKEND_URL = os.getenv("BACKEND_URL", "https://legal-techai.onrender.com")

# Configure the Streamlit page layout and metadata
# This must be the first Streamlit command called in the script
st.set_page_config(
    page_title="Legal-TechAI Demo",
    page_icon="⚖️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for Professional Dark Theme
st.markdown("""
<style>
    .card {
        background-color: #1e1e2e;
        border-radius: 10px;
        padding: 20px;
        margin-bottom: 20px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
        border: 1px solid #333;
    }
    .high-severity {
        border-left: 5px solid #ff4b4b;
    }
    .medium-severity {
        border-left: 5px solid #ffa421;
    }
    .low-severity {
        border-left: 5px solid #21c354;
    }
    .badge {
        display: inline-block;
        padding: 5px 10px;
        border-radius: 5px;
        font-size: 12px;
        font-weight: bold;
        background-color: #2e2e3e;
        color: #e0e0e0;
        margin-bottom: 10px;
    }
    .hallucination-warning {
        background-color: #4a1f1f;
        color: #ff9999;
        padding: 10px;
        border-radius: 5px;
        border-left: 5px solid #ff4b4b;
        margin-top: 10px;
        font-size: 14px;
    }
</style>
""", unsafe_allow_html=True)

# ==========================================
# SIDEBAR NAVIGATION
# ==========================================
# The sidebar provides a navigation menu for the user to switch between different tools.
st.sidebar.markdown("<h1 style='text-align: center;'>⚖️ Legal-TechAI</h1>", unsafe_allow_html=True)
st.sidebar.markdown("<p style='text-align: center; font-style: italic; color: #aaa;'>The pipe that justice flows through</p>", unsafe_allow_html=True)
st.sidebar.divider()

# Streamlit radio buttons automatically create state variables.
# The selected value will dictate which page is rendered below.
page = st.sidebar.radio("Navigation", [
    "Case Summarizer",
    "Inconsistency Detector",
    "Legal Q&A (BNS/BNSS/BSA)",
    "System Health"
])

def create_card(title, content, severity=None):
    severity_class = f"{severity}-severity" if severity else ""
    st.markdown(f"""
    <div class="card {severity_class}">
        <h4 style="margin-top:0; color:#bbbbdd;">{title}</h4>
        <p style="margin-bottom:0;">{content}</p>
    </div>
    """, unsafe_allow_html=True)

if page == "Case Summarizer":
    st.title("📄 Case Summarizer")
    st.markdown("Upload a legal document to generate a structured summary based on the new Indian criminal codes.")
    
    uploaded_file = st.file_uploader("Upload Document (PDF or TXT)", type=["pdf", "txt"])
    
    if st.button("Generate Summary"):
        if uploaded_file is not None:
            with st.spinner("Ingesting document..."):
                try:
                    # 1. Ingest
                    files = {"file": (uploaded_file.name, uploaded_file.getvalue(), uploaded_file.type)}
                    ingest_response = requests.post(f"{BACKEND_URL}/ingest", files=files)
                    ingest_response.raise_for_status()
                    
                    chunks = ingest_response.json()
                    
                    # Combine chunks text for summarization
                    if isinstance(chunks, list):
                        full_text = "\\n".join([chunk.get("text", "") for chunk in chunks if isinstance(chunk, dict)])
                    elif isinstance(chunks, dict) and "message" in chunks:
                        st.error(chunks["message"])
                        full_text = ""
                    else:
                        full_text = ""
                        
                    if full_text:
                        st.success("Document ingested successfully.")
                        
                        # 2. Summarize
                        with st.spinner("Summarizing..."):
                            summary_payload = {"text": full_text}
                            summary_response = requests.post(f"{BACKEND_URL}/ai/summarize", json=summary_payload)
                            summary_response.raise_for_status()
                            
                            summary_data = summary_response.json()
                            
                            st.markdown('<div class="badge">Powered by BNS/BNSS/BSA</div>', unsafe_allow_html=True)
                            
                            # Display Results in Cards
                            col1, col2 = st.columns(2)
                            with col1:
                                parties = summary_data.get("parties", "N/A")
                                if isinstance(parties, list): parties = ", ".join(parties)
                                create_card("Parties", parties)
                                
                                charges = summary_data.get("charges", "N/A")
                                if isinstance(charges, list): charges = ", ".join(charges)
                                create_card("Charges", charges)
                                
                            with col2:
                                key_dates = summary_data.get("key_dates", "N/A")
                                if isinstance(key_dates, list): key_dates = ", ".join(key_dates)
                                create_card("Key Dates", key_dates)
                                
                                evidence = summary_data.get("evidence", "N/A")
                                if isinstance(evidence, list): evidence = ", ".join(evidence)
                                create_card("Evidence", evidence)
                            
                            st.subheader("Detailed Summary")
                            st.write(summary_data.get("summary", "No detailed summary available."))
                            
                            # Download button (using TXT that resembles a PDF)
                            download_text = f"LEGAL-TECHAI SUMMARY REPORT\\n\\n"
                            download_text += f"Parties: {parties}\\n"
                            download_text += f"Charges: {charges}\\n"
                            download_text += f"Key Dates: {key_dates}\\n"
                            download_text += f"Evidence: {evidence}\\n\\n"
                            download_text += f"Detailed Summary:\\n{summary_data.get('summary', '')}"
                            
                            st.download_button(
                                label="Download Summary (as PDF/TXT)",
                                data=download_text,
                                file_name="case_summary.txt",
                                mime="text/plain"
                            )
                            
                except requests.exceptions.RequestException as e:
                    st.error(f"Error communicating with backend: {e}")
        else:
            st.warning("Please upload a file first.")

elif page == "Inconsistency Detector":
    st.title("🔍 Inconsistency Detector")
    
    col1, col2 = st.columns(2)
    with col1:
        doc_a = st.file_uploader("Document A", type=["pdf", "txt"], key="doc_a")
        doc_a_type = st.selectbox("Document A Type", ["FIR", "Witness Statement", "Charge Sheet", "Court Order"], key="type_a")
    
    with col2:
        doc_b = st.file_uploader("Document B", type=["pdf", "txt"], key="doc_b")
        doc_b_type = st.selectbox("Document B Type", ["FIR", "Witness Statement", "Charge Sheet", "Court Order"], key="type_b")
        
    if st.button("Scan for Contradictions"):
        if doc_a and doc_b:
            with st.spinner("Running 4-step Gemini pipeline... (Entity Extraction → Claim Extraction → Contradiction Detection → Evidence Linking)"):
                try:
                    files = [
                        ("files", (doc_a.name, doc_a.getvalue(), doc_a.type or "application/octet-stream")),
                        ("files", (doc_b.name, doc_b.getvalue(), doc_b.type or "application/octet-stream"))
                    ]
                    
                    start_time = time.time()
                    resp = requests.post(f"{BACKEND_URL}/inconsistency/detect-inconsistencies", files=files, timeout=120)
                    resp.raise_for_status()
                    elapsed = time.time() - start_time
                    
                    data = resp.json()
                    total = data.get("total_contradictions", 0)
                    high = data.get("high_severity", 0)
                    contradictions = data.get("contradictions", [])
                    clean_facts = data.get("clean_facts", [])
                    
                    # Summary metrics
                    m1, m2, m3 = st.columns(3)
                    m1.metric("Total Contradictions", total)
                    m2.metric("High Severity", high)
                    m3.metric("Analysis Time", f"{elapsed:.1f}s")
                    
                    if contradictions:
                        st.subheader(f"⚠️ {len(contradictions)} Contradiction(s) Found")
                        
                        for inc in contradictions:
                            sev = inc.get("severity", "LOW").lower()
                            ctype = inc.get("contradiction_type", "FACTUAL")
                            explanation = inc.get("explanation", "")
                            quote_a = inc.get("exact_quote_doc_a", "N/A")
                            quote_b = inc.get("exact_quote_doc_b", "N/A")
                            impossibility = inc.get("impossibility_reason")
                            
                            # Build impossibility badge if present
                            impossibility_html = ""
                            if impossibility:
                                impossibility_html = f'''
                                <div style="margin-top:10px; padding:10px; background:#4a1f1f; border-radius:5px; border-left:3px solid #ff4b4b;">
                                    <b style="color:#ff9999;">🚫 Physical Impossibility:</b><br/>
                                    <span style="color:#ffcccc;">{impossibility}</span>
                                </div>'''
                            
                            st.markdown(f'''
                            <div class="card {sev}-severity">
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <h4 style="margin-top:0; color:#bbbbdd;">Severity: {sev.upper()} | Type: {ctype}</h4>
                                </div>
                                <p style="margin-bottom:15px; color:#ddd;"><b>Explanation:</b> {explanation}</p>
                                <div style="display:flex; gap: 10px;">
                                    <div style="flex: 1; padding: 10px; background: #2a2a3a; border-radius: 5px;">
                                        <b>{doc_a.name} ({doc_a_type}):</b><br/><i style="color:#aaa;">"{quote_a}"</i>
                                    </div>
                                    <div style="flex: 1; padding: 10px; background: #2a2a3a; border-radius: 5px;">
                                        <b>{doc_b.name} ({doc_b_type}):</b><br/><i style="color:#aaa;">"{quote_b}"</i>
                                    </div>
                                </div>
                                {impossibility_html}
                            </div>
                            ''', unsafe_allow_html=True)
                    else:
                        st.success("✅ No contradictions detected. Documents are consistent.")
                    
                    # Show clean/consistent facts
                    if clean_facts:
                        with st.expander(f"✅ {len(clean_facts)} Consistent Fact(s)", expanded=False):
                            for cf in clean_facts:
                                st.markdown(f'''
                                <div class="card" style="border-left: 3px solid #21c354;">
                                    <b>Fact:</b> {cf.get("fact", "")}<br/>
                                    <b>Source:</b> {cf.get("document_id", "")} — {cf.get("page_ref", "")}<br/>
                                    <i style="color:#aaa;">"{cf.get("exact_quote", "")}"</i>
                                </div>
                                ''', unsafe_allow_html=True)
                        
                except requests.exceptions.RequestException as e:
                    st.error(f"Error communicating with backend: {e}")
        else:
            st.warning("Please upload both Document A and Document B.")

elif page == "Legal Q&A (BNS/BNSS/BSA)":
    st.title("📚 Legal Q&A (BNS/BNSS/BSA)")
    
    st.markdown("**Example Questions:**")
    col1, col2, col3 = st.columns(3)
    
    example_q = None
    if col1.button("What is the penalty for cyber terrorism?"):
        example_q = "What is the penalty for cyber terrorism under BNS?"
    if col2.button("How has sedition changed?"):
        example_q = "How has the law on sedition changed in the new codes?"
    if col3.button("Rules for electronic evidence?"):
        example_q = "What are the new rules for admissibility of electronic evidence under BSA?"
        
    question = st.text_input("Ask any question about the new Indian criminal codes", value=example_q if example_q else "")
    
    if st.button("Get Answer") or (question and question != example_q):
        if question:
            with st.spinner("Searching legal codes..."):
                try:
                    payload = {"question": question}
                    resp = requests.post(f"{BACKEND_URL}/rag/query", json=payload)
                    resp.raise_for_status()
                    
                    data = resp.json()
                    
                    st.markdown("### Answer")
                    st.write(data.get("answer", "No answer found."))
                    
                    citations = data.get("citations", [])
                    if citations:
                        st.markdown("**Citations:**")
                        for cite in citations:
                            st.markdown(f"- {cite}")
                            
                    hallucinations = data.get("hallucination_flags", [])
                    if hallucinations:
                        for flag in hallucinations:
                            st.markdown(f'''
                            <div class="hallucination-warning">
                                ⚠️ <b>Warning:</b> {flag}
                            </div>
                            ''', unsafe_allow_html=True)
                            
                except requests.exceptions.RequestException as e:
                    st.error(f"Error communicating with backend: {e}")

elif page == "System Health":
    st.title("⚙️ System Health")
    
    if "deploy_time" not in st.session_state:
        st.session_state.deploy_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
    if st.button("Refresh Now"):
        pass # Streamlit reruns on button click
        
    try:
        resp = requests.get(f"{BACKEND_URL}/health", timeout=5)
        status = resp.json().get("status", "unknown") if resp.ok else "error"
        status_color = "#21c354" if status == "healthy" else "#ff4b4b"
    except:
        status = "unreachable"
        status_color = "#ff4b4b"
        
    # Mocking documents processed for demo purposes
    docs_processed = 42
    
    st.markdown(f"""
    <div class="card" style="border-left: 5px solid {status_color};">
        <h3>API Status: <span style="color: {status_color}; text-transform: uppercase;">{status}</span></h3>
        <p><b>Last Deploy Time:</b> {st.session_state.deploy_time}</p>
        <p><b>Documents Processed Today:</b> {docs_processed}</p>
        <p style="color: #888; font-size: 0.9em; margin-top: 15px;">Target Backend: {BACKEND_URL}</p>
    </div>
    """, unsafe_allow_html=True)
    
    time.sleep(30)
    st.rerun()
