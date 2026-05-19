import re
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator
import uuid
from datetime import datetime, timezone


# ===================== DOMAIN MODELS =====================

class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    auth_provider: str = "google"  # "google" or "apple"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserSession(BaseModel):
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Profile(BaseModel):
    profile_id: str = Field(default_factory=lambda: f"profile_{uuid.uuid4().hex[:12]}")
    user_id: str
    name: str
    profile_type: Literal["personal", "business", "shared"] = "personal"
    is_default: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Category(BaseModel):
    category_id: str = Field(default_factory=lambda: f"cat_{uuid.uuid4().hex[:12]}")
    user_id: str
    profile_id: Optional[str] = None  # None means available for all profiles
    name: str
    icon: str = "tag"
    color: str = "#6366f1"
    is_default: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PaymentMethod(BaseModel):
    payment_id: str = Field(default_factory=lambda: f"pm_{uuid.uuid4().hex[:12]}")
    user_id: str
    name: str
    type: str  # "cash", "credit_card", "debit_card", "bank_transfer", "other"
    last_four: Optional[str] = None  # Last 4 digits for cards
    is_default: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Expense(BaseModel):
    expense_id: str = Field(default_factory=lambda: f"exp_{uuid.uuid4().hex[:12]}")
    user_id: str
    profile_id: str
    type: str = "expense"  # "expense", "income", "transfer"
    amount: float
    category_id: Optional[str] = None
    payment_method_id: str
    to_payment_method_id: Optional[str] = None  # For transfers
    description: str
    merchant: Optional[str] = None
    date: datetime
    time: Optional[str] = None  # HH:MM format
    receipt_image: Optional[str] = None  # Base64 encoded image
    notes: Optional[str] = None
    is_pending: bool = False
    # Recurring transaction fields
    is_recurring: bool = False
    recurring_frequency: Optional[str] = None
    recurring_start_date: Optional[datetime] = None
    recurring_end_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Budget(BaseModel):
    budget_id: str = Field(default_factory=lambda: f"budget_{uuid.uuid4().hex[:12]}")
    user_id: str
    profile_id: str
    category_id: Optional[str] = None  # None means total budget for the profile
    amount: float
    period: str = "monthly"  # "weekly", "monthly", "yearly"
    start_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SavingsGoal(BaseModel):
    goal_id: str = Field(default_factory=lambda: f"goal_{uuid.uuid4().hex[:12]}")
    user_id: str
    profile_id: str
    title: str
    target_amount: float = Field(gt=0)
    current_amount: float = Field(ge=0)
    deadline: datetime
    category: str
    status: Literal["active", "paused", "completed", "cancelled"] = "active"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserSettings(BaseModel):
    user_id: str
    dark_mode: bool = False
    currency: str = "USD"
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ===================== REQUEST / RESPONSE SCHEMAS =====================

class AuthResponse(BaseModel):
    user: User
    session_token: str

    class Config:
        arbitrary_types_allowed = True


class MessageResponse(BaseModel):
    message: str


class ApiRootResponse(BaseModel):
    message: str
    version: str


class StatusResponse(BaseModel):
    status: str


class BudgetProgressItem(Budget):
    spent: float
    remaining: float
    percentage: float
    is_over_budget: bool


class BudgetProgressResponse(BaseModel):
    budgets: List[BudgetProgressItem]
    total_budget: Optional[BudgetProgressItem] = None


class AnalyticsSummaryResponse(BaseModel):
    total_spend: float
    total_income: float
    net_balance: float
    current_month_spend: float
    previous_month_spend: float
    month_over_month_change_pct: float


class CategoryBreakdownItem(BaseModel):
    category_id: str
    category_name: str
    amount: float
    percentage: float


class CategoryBreakdownResponse(BaseModel):
    items: List[CategoryBreakdownItem]


class PaymentMethodBreakdownItem(BaseModel):
    payment_method_id: str
    payment_method_name: str
    amount: float


class PaymentMethodBreakdownResponse(BaseModel):
    items: List[PaymentMethodBreakdownItem]


class MonthlyTrendItem(BaseModel):
    month: str
    amount: float


class MonthlyTrendResponse(BaseModel):
    items: List[MonthlyTrendItem]


class InsightItem(BaseModel):
    type: str
    severity: Literal["info", "warning", "positive"]
    title: str
    message: str
    metric: Optional[dict] = None


class InsightListResponse(BaseModel):
    insights: List[InsightItem]


class EmailRegisterRequest(BaseModel):
    email: str
    password: str
    name: str


class EmailLoginRequest(BaseModel):
    email: str
    password: str


class ProfileCreate(BaseModel):
    name: str
    profile_type: Literal["personal", "business", "shared"] = "personal"


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    profile_type: Optional[Literal["personal", "business", "shared"]] = None
    is_default: Optional[bool] = None


class CategoryCreate(BaseModel):
    name: str
    icon: str = "tag"
    color: str = "#6366f1"
    profile_id: Optional[str] = None

    @field_validator("color")
    @classmethod
    def validate_color(cls, value: str) -> str:
        if not re.match(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$", value):
            raise ValueError("Color must be a valid hex string")
        return value


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None

    @field_validator("color")
    @classmethod
    def validate_color(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        if not re.match(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$", value):
            raise ValueError("Color must be a valid hex string")
        return value


class PaymentMethodCreate(BaseModel):
    name: str
    type: str
    last_four: Optional[str] = None
    is_default: bool = False

    @field_validator("last_four")
    @classmethod
    def validate_last_four(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        if not re.match(r"^\d{4}$", value):
            raise ValueError("last_four must be exactly 4 digits")
        return value


class PaymentMethodUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    last_four: Optional[str] = None
    is_default: Optional[bool] = None

    @field_validator("last_four")
    @classmethod
    def validate_last_four(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        if not re.match(r"^\d{4}$", value):
            raise ValueError("last_four must be exactly 4 digits")
        return value


class ExpenseCreate(BaseModel):
    profile_id: str
    type: Literal["expense", "income", "transfer"] = "expense"
    amount: float = Field(gt=0)
    category_id: Optional[str] = None
    payment_method_id: str
    to_payment_method_id: Optional[str] = None
    description: str
    merchant: Optional[str] = None
    date: datetime
    time: Optional[str] = None
    receipt_image: Optional[str] = None
    notes: Optional[str] = None
    is_pending: bool = False
    # Recurring transaction fields
    is_recurring: bool = False
    recurring_frequency: Optional[Literal["daily", "weekly", "monthly", "yearly"]] = None
    recurring_start_date: Optional[datetime] = None
    recurring_end_date: Optional[datetime] = None

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("Description cannot be blank")
        return value.strip()

    @field_validator("time")
    @classmethod
    def validate_time(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        if not re.match(r"^(?:[01]\d|2[0-3]):[0-5]\d$", value):
            raise ValueError("Time must be in HH:MM format")
        return value

    @model_validator(mode="after")
    def validate_transfer_and_recurring(self):
        if self.type == "transfer":
            if not self.to_payment_method_id:
                raise ValueError("to_payment_method_id is required for transfer type")
            if self.to_payment_method_id == self.payment_method_id:
                raise ValueError("to_payment_method_id must not equal payment_method_id")

        if (
            self.recurring_start_date
            and self.recurring_end_date
            and self.recurring_end_date < self.recurring_start_date
        ):
            raise ValueError("recurring_end_date cannot be before recurring_start_date")
        return self


class ExpenseUpdate(BaseModel):
    type: Optional[Literal["expense", "income", "transfer"]] = None
    amount: Optional[float] = None
    category_id: Optional[str] = None
    payment_method_id: Optional[str] = None
    to_payment_method_id: Optional[str] = None
    description: Optional[str] = None
    merchant: Optional[str] = None
    date: Optional[datetime] = None
    time: Optional[str] = None
    receipt_image: Optional[str] = None
    notes: Optional[str] = None
    is_pending: Optional[bool] = None
    # Recurring transaction fields
    is_recurring: Optional[bool] = None
    recurring_frequency: Optional[Literal["daily", "weekly", "monthly", "yearly"]] = None
    recurring_start_date: Optional[datetime] = None
    recurring_end_date: Optional[datetime] = None

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, value: Optional[float]) -> Optional[float]:
        if value is not None and value <= 0:
            raise ValueError("Amount must be greater than 0")
        return value

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        if not value.strip():
            raise ValueError("Description cannot be blank")
        return value.strip()

    @field_validator("time")
    @classmethod
    def validate_time(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        if not re.match(r"^(?:[01]\d|2[0-3]):[0-5]\d$", value):
            raise ValueError("Time must be in HH:MM format")
        return value

    @model_validator(mode="after")
    def validate_transfer_and_recurring(self):
        if self.type == "transfer":
            if not self.to_payment_method_id:
                raise ValueError("to_payment_method_id is required for transfer type")
            if self.payment_method_id and self.to_payment_method_id == self.payment_method_id:
                raise ValueError("to_payment_method_id must not equal payment_method_id")

        if (
            self.recurring_start_date
            and self.recurring_end_date
            and self.recurring_end_date < self.recurring_start_date
        ):
            raise ValueError("recurring_end_date cannot be before recurring_start_date")
        return self


class BudgetCreate(BaseModel):
    profile_id: str
    category_id: Optional[str] = None
    amount: float = Field(gt=0)
    period: Literal["weekly", "monthly", "yearly"] = "monthly"


class BudgetUpdate(BaseModel):
    amount: Optional[float] = None
    period: Optional[Literal["weekly", "monthly", "yearly"]] = None

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, value: Optional[float]) -> Optional[float]:
        if value is not None and value <= 0:
            raise ValueError("Amount must be greater than 0")
        return value


class SavingsGoalCreate(BaseModel):
    profile_id: str
    title: str
    target_amount: float = Field(gt=0)
    current_amount: float = Field(ge=0)
    deadline: datetime
    category: str
    status: Literal["active", "paused", "completed", "cancelled"] = "active"

    @field_validator("title", "category")
    @classmethod
    def validate_non_blank(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("Field cannot be blank")
        return value.strip()

    @field_validator("deadline")
    @classmethod
    def validate_deadline_not_past(cls, value: datetime) -> datetime:
        compare_value = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        if compare_value < datetime.now(timezone.utc):
            raise ValueError("deadline cannot be in the past")
        return value


class SavingsGoalUpdate(BaseModel):
    profile_id: Optional[str] = None
    title: Optional[str] = None
    target_amount: Optional[float] = None
    current_amount: Optional[float] = None
    deadline: Optional[datetime] = None
    category: Optional[str] = None
    status: Optional[Literal["active", "paused", "completed", "cancelled"]] = None

    @field_validator("title", "category")
    @classmethod
    def validate_optional_non_blank(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        if not value.strip():
            raise ValueError("Field cannot be blank")
        return value.strip()

    @field_validator("target_amount")
    @classmethod
    def validate_target_amount(cls, value: Optional[float]) -> Optional[float]:
        if value is not None and value <= 0:
            raise ValueError("target_amount must be greater than 0")
        return value

    @field_validator("current_amount")
    @classmethod
    def validate_current_amount(cls, value: Optional[float]) -> Optional[float]:
        if value is not None and value < 0:
            raise ValueError("current_amount cannot be negative")
        return value

    @field_validator("deadline")
    @classmethod
    def validate_optional_deadline_not_past(cls, value: Optional[datetime]) -> Optional[datetime]:
        if value is None:
            return value
        compare_value = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        if compare_value < datetime.now(timezone.utc):
            raise ValueError("deadline cannot be in the past")
        return value


class SavingsGoalProjection(BaseModel):
    basis: Literal["historical_velocity", "manual_assumption", "already_completed", "unavailable"]
    monthly_contribution_assumed: float
    months_remaining: Optional[float] = None
    projected_completion_date: Optional[datetime] = None


class SavingsGoalResponse(SavingsGoal):
    progress_percentage: float = 0.0
    monthly_savings_recommendation: Optional[float] = None
    projected_completion: SavingsGoalProjection


class UserSettingsUpdate(BaseModel):
    dark_mode: Optional[bool] = None
    currency: Optional[str] = None


class ScanReceiptRequest(BaseModel):
    image: str  # Base64 encoded image


class ChatInsightsRequest(BaseModel):
    profile_id: str
    recent_days: int = Field(default=30, ge=7, le=90)
    question: str = Field(default="How can I save more?", min_length=3, max_length=300)


class ChatInsightsResponse(BaseModel):
    profile_id: str
    generated_at: datetime
    context: dict
    prompt_template: dict
    recommendation: dict
