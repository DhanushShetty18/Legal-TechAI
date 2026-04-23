from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from auth_utils import ALGORITHM, SECRET_KEY
from jose import jwt, JWTError
from database import SessionLocal
import models
from datetime import datetime

class DataResidencyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Data-Location"] = "India"
        return response

class AuditLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        method = request.method
        path = request.url.path
        action = "UNKNOWN"
        resource_type = "UNKNOWN"
        resource_id = None
        
        # Action mapping
        if "/auth/login" in path and method == "POST":
            action = "USER_LOGIN"
            resource_type = "AUTH"
        elif "/auth/logout" in path and method == "POST":
            action = "USER_LOGOUT"
            resource_type = "AUTH"
        elif "/documents" in path:
            if method == "POST":
                action = "DOCUMENT_UPLOAD"
            elif method == "GET":
                action = "DOCUMENT_VIEW"
            elif method == "DELETE":
                action = "DOCUMENT_DELETE"
            resource_type = "DOCUMENT"
        elif "/cases" in path:
            if method == "POST":
                action = "CASE_CREATE"
            elif method == "GET":
                action = "CASE_VIEW"
            elif method in ["PUT", "PATCH"]:
                action = "CASE_UPDATE"
            resource_type = "CASE"
        elif "/inconsistencies" in path and method == "POST":
            action = "INCONSISTENCY_SCAN_RUN"
            resource_type = "INCONSISTENCY"
        elif "/rag" in path and method == "POST":
            action = "RAG_QUERY"
            resource_type = "RAG"

        # Try to extract resource ID from path, e.g. /cases/123 -> 123
        parts = path.strip("/").split("/")
        if len(parts) >= 2 and parts[1].isdigit():
            resource_id = int(parts[1])
            
        # Proceed with request
        response = await call_next(request)
        
        # Attempt to extract user_id from token
        user_id = None
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            try:
                payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
                user_id = payload.get("user_id")
            except JWTError:
                pass
        
        # We also want to log successful logins, where the token might be in the response rather than request header
        # But parsing response body in middleware is complex. 
        # Alternatively, the endpoint can just return the token and the client passes it in the NEXT request.
        # But wait, login action needs user_id. We can't easily get it here unless we read the request body or response body.
        # I'll leave user_id=None for login if it fails to extract, but we can update the user_id if we want.
        
        if action != "UNKNOWN" and user_id is not None:
            ip_address = request.client.host if request.client else "unknown"
            success = response.status_code < 400
            
            db = SessionLocal()
            try:
                log_entry = models.AuditLog(
                    user_id=user_id,
                    action=action,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    timestamp=datetime.utcnow(),
                    ip_address=ip_address,
                    success=success
                )
                db.add(log_entry)
                db.commit()
            except Exception as e:
                print(f"Failed to write audit log: {e}")
            finally:
                db.close()
                
        return response
