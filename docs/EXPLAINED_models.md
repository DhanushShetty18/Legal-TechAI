# EXPLAINED: backend/models.py

> **One-line summary:** This file defines your database tables as Python classes. SQLAlchemy reads these classes and creates the actual SQLite tables automatically.

---

## What SQLAlchemy ORM Is

SQLAlchemy is a Python library that lets you work with databases using Python objects instead of writing raw SQL. The **ORM (Object-Relational Mapper)** part means:

- A Python class = a database table
- A Python object (instance of that class) = one row in that table
- Attribute access (`user.email`) = reading a column value

Instead of:
```sql
INSERT INTO users (full_name, email) VALUES ('Dhanush', 'd@d.com');
```

You write:
```python
user = models.User(full_name="Dhanush", email="d@d.com")
db.add(user)
db.commit()
```

SQLAlchemy translates the Python into SQL and executes it.

---

## Section-by-Section Walkthrough

### Imports

```python
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Enum, Text
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from database import Base
```

- `Column` — defines a column in the table. Every field in your model is a `Column`.
- `Integer`, `String`, `Boolean`, etc. — the SQL column types.
- `ForeignKey` — links one table to another (e.g., a document belongs to a case).
- `relationship` — tells SQLAlchemy how to load related objects (e.g., `case.documents` gives you all documents for a case).
- `datetime` — Python's standard library for dates/times. Used as the default value for `created_at`.
- `Base` — the parent class from `database.py`. Every model inherits from it so SQLAlchemy knows it's a table.

---

### Enums

```python
class UserRole(str, enum.Enum):
    CITIZEN = "citizen"
    LAWYER = "lawyer"
    JUDGE = "judge"
    CLERK = "clerk"
    ADMIN = "admin"

class DocumentCaptureMethod(str, enum.Enum):
    CAMERA = "camera"
    UPLOAD = "upload"
```

**What enums are:** A fixed set of allowed values. Instead of storing any arbitrary string in the `role` column, you restrict it to exactly these options.

**`str, enum.Enum` (double inheritance):** Makes enum values behave like strings. `UserRole.LAWYER` equals the string `"lawyer"`. This is necessary for SQLAlchemy to store them as strings in the database.

**Note:** The `role` column in `User` is defined as `Column(String, ...)` not `Column(Enum(UserRole), ...)`. This means SQLAlchemy stores any string — the enum is only used as documentation/default value. If you wanted to enforce the enum at the database level, you'd use `Column(Enum(UserRole))`.

---

### User Model

```python
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default=UserRole.CITIZEN)
    is_verified_identity = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    cases = relationship("Case", back_populates="creator")
    documents = relationship("Document", back_populates="uploader")
    audit_logs = relationship("AuditLog", back_populates="user")
```

**Key column modifiers:**
- `primary_key=True` — makes `id` the unique identifier. SQLite auto-increments it.
- `index=True` — creates a database index for faster lookups on that column. Use on columns you query/filter by frequently.
- `unique=True` — prevents two users from having the same email. SQLite enforces this at the database level (not just Python).
- `default=datetime.utcnow` — **note: no parentheses**. If you wrote `default=datetime.utcnow()`, the default would be the time the server started, not the time of each row creation. Without `()`, SQLAlchemy calls the function each time a row is created.

**Relationships:**
```python
cases = relationship("Case", back_populates="creator")
```
This tells SQLAlchemy: "a User has many Cases." The `"Case"` is a string reference to the `Case` class. SQLAlchemy resolves it at startup. When you access `user.cases`, SQLAlchemy automatically runs `SELECT * FROM cases WHERE creator_id = <user.id>`.

**Security note:** `hashed_password` stores a bcrypt hash, not the plain password. The plain password is never stored. Look at `crud.py` for how hashing is done.

---

### Case Model

```python
class Case(Base):
    __tablename__ = "cases"

    id = Column(Integer, primary_key=True, index=True)
    case_number = Column(String, unique=True, index=True)
    title = Column(String, index=True)
    description = Column(Text)
    case_type = Column(String, default="CIVIL")
    status = Column(String, default="OPEN")
    priority = Column(String, default="NORMAL")
    creator_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    creator = relationship("User", back_populates="cases")
    documents = relationship("Document", back_populates="case")
```

**`String` vs `Text`:** Both store text. `String` is for short text (names, codes, types). `Text` is for potentially long text with no length limit (descriptions, document content). In SQLite there's almost no practical difference, but it's good practice to use `Text` for long content.

**`case_number` is `unique=True`:** Every case must have a unique identifier. Look at `crud.py` to see how case numbers are generated (usually a UUID).

**`ForeignKey("users.id")`:** `creator_id` stores the `id` of the user who created this case. The string `"users.id"` refers to the `id` column in the `users` table. SQLite enforces that you can't set `creator_id` to an ID that doesn't exist in `users`.

---

### Document Model

```python
class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"))
    uploader_id = Column(Integer, ForeignKey("users.id"))
    
    file_path = Column(String)
    file_hash = Column(String, index=True)   # ← SHA-256
    file_type = Column(String)
    
    is_verified = Column(Boolean, default=False)
    verification_status = Column(String, default="PENDING")
    
    capture_method = Column(String, default=DocumentCaptureMethod.CAMERA)
    capture_metadata = Column(Text)  # JSON string: device info, location, timestamps
    
    version = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    filename = Column(String)
    doc_type = Column(String)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
```

**`file_hash` is the integrity proof.** SHA-256 is computed from the raw file bytes at upload time. If you re-hash the file later and the hash differs, the file was tampered with. This is your equivalent of Estonia's KSI blockchain — a tamper-evident audit trail.

**`capture_metadata = Column(Text)`** stores JSON as a string. SQLite doesn't have a native JSON column type. Instead, you serialize a Python dict to a JSON string before storing, and deserialize when reading. This is functional but means you can't query individual JSON fields without extra logic.

**`version = Column(Integer, default=1)`** is the beginning of document version history — if a document is re-uploaded or amended, you'd increment this. Currently not used beyond the default.

---

### AuditLog Model

```python
class AuditLog(Base):
    """Tracks all actions for Evidence Provenance Infrastructure."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    action = Column(String)        # CREATE, VIEW, VERIFY, UPDATE
    target_type = Column(String)   # DOCUMENT, CASE
    target_id = Column(Integer)
    details = Column(Text)         # JSON details
    timestamp = Column(DateTime, default=datetime.utcnow)
```

**Why this exists:** In a legal system, you need to prove who did what, when. The audit log is your answer to "who accessed this document?" or "who changed the case status?" 

**Currently mostly unpopulated** — the endpoints don't consistently write to `audit_logs` yet. This is infrastructure waiting to be wired up.

---

### Inconsistency Model

```python
class Inconsistency(Base):
    __tablename__ = "inconsistencies"

    doc_a = relationship("Document", foreign_keys=[doc_a_id])
    doc_b = relationship("Document", foreign_keys=[doc_b_id])
```

**`foreign_keys=[doc_a_id]`** is needed because there are TWO foreign keys to the same `documents` table (`doc_a_id` and `doc_b_id`). Without specifying which one, SQLAlchemy doesn't know which foreign key to use for each relationship and raises an `AmbiguousForeignKeysError`.

---

## How `relationship()` Works in Practice

```python
# Get a case from the database
case = db.query(models.Case).filter(models.Case.id == 1).first()

# Access related documents — SQLAlchemy runs a query automatically
for doc in case.documents:
    print(doc.file_hash)

# Navigate the other direction
doc = db.query(models.Document).first()
print(doc.case.title)    # SQLAlchemy fetches the related Case automatically
print(doc.uploader.email)  # SQLAlchemy fetches the related User automatically
```

This is called **lazy loading** — related objects are fetched on demand. Be careful: accessing `case.documents` inside a loop over many cases will cause N+1 queries (one query per case). For bulk operations, use `join()` or `joinedload()`.

---

## What Breaks If This File Is Removed

`models.Base.metadata.create_all(bind=engine)` in main.py would find no models → no tables created → every database query crashes. The import in main.py would also fail.

---

## Two Exercises

**Exercise 1:** Add a `court_name` field to the `Case` model (a nullable String). Remember: after adding a column to models.py, you need to delete `legal_tech_ai.db` and restart the server — SQLAlchemy doesn't auto-migrate existing databases. (For production, you'd use Alembic migrations instead.)

**Exercise 2:** Access `user.cases` in a Python shell (or a test endpoint) and count how many SQL queries SQLAlchemy runs. Use SQLAlchemy's `echo=True` setting in `database.py` to see all SQL: `engine = create_engine(URL, echo=True)`. Count the queries. Now look up "SQLAlchemy joinedload" and rewrite the query to load cases and documents in one query instead of N+1.
