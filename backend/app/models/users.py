from sqlalchemy import BigInteger, String, Text, Boolean, TIMESTAMP
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    job_title: Mapped[str] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[str] = mapped_column(TIMESTAMP, nullable=False, default="CURRENT_TIMESTAMP")
    updated_at: Mapped[str] = mapped_column(TIMESTAMP, nullable=False, default="CURRENT_TIMESTAMP")
    last_login_at: Mapped[str] = mapped_column(TIMESTAMP)
    