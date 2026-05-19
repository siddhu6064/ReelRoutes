# SAVIQ - Product Requirements Document

## Overview
Full-stack expense tracking application with mobile (React Native/Expo) and web (React/Vite) frontends sharing a common FastAPI backend with MongoDB database.

## Architecture

### Tech Stack
- **Backend**: FastAPI (Python) with MongoDB
- **Mobile Frontend**: React Native + Expo
- **Web Frontend**: React + Vite + Tailwind CSS
- **Shared Module**: TypeScript types, constants, utilities
- **Database**: MongoDB
- **AI Integration**: OpenAI GPT-4.1 for receipt scanning and insights

### Project Structure
```
/app
├── backend/          # FastAPI Python backend
├── frontend/         # React Native mobile app (Expo)
├── web/              # React web app (Vite + Tailwind)
└── shared/           # Shared code between web & mobile
    ├── types/        # TypeScript interfaces
    ├── constants/    # Colors, icons, config
    └── utils/        # Helper functions
```

### Key Services
- Authentication (Email/Password, Google OAuth, Guest Mode)
- Transaction Management (Expenses, Income, Transfers)
- Profile Management (Personal, Business, Custom)
- Category Management with custom colors/icons
- Payment Methods Management
- Budget Management with Progress Tracking
- AI-powered Receipt Scanning
- AI-powered Spending Insights
- Statistics & Analytics
- Data Export (CSV/PDF)
- Dark Mode Support

## User Personas

1. **Personal Finance User**: Tracks daily expenses, monitors spending habits
2. **Small Business Owner**: Separates personal and business expenses
3. **Budget-Conscious User**: Uses analytics and budgets to find saving opportunities

## Core Requirements

### Authentication
- [x] Email/password registration and login
- [x] Google OAuth integration
- [x] Guest mode with local storage
- [x] Session management with JWT

### Transaction Management
- [x] Create/Read/Update/Delete transactions
- [x] Support for Expense, Income, and Transfer types
- [x] Category assignment
- [x] Payment method tracking
- [x] Recurring transaction support
- [x] Pending status support
- [x] Receipt image attachment

### Budget Management
- [x] Total budget (profile-wide) setting
- [x] Category-specific budgets
- [x] Budget progress tracking (spent/remaining)
- [x] Visual progress bars with percentage
- [x] Over-budget alerts

### Analytics & Insights
- [x] Total balance, income, expenses, transfers
- [x] Spending by category breakdown
- [x] Period comparison (week, month, year)
- [x] AI-powered spending insights
- [x] Cash flow charts

### Data Export
- [x] CSV export for spreadsheets
- [x] PDF export for reports
- [x] Date range filtering
- [x] Summary statistics included

### Settings & Management
- [x] Profile management (Personal, Business, Custom)
- [x] Category management with colors/icons
- [x] Payment method management
- [x] Dark mode toggle (synced across devices)

## What's Been Implemented

### Date: January 27, 2026

#### Shared Module (New)
- Created `/app/shared` with centralized types, constants, and utilities
- TypeScript interfaces for User, Transaction, Budget, etc.
- Shared constants: CATEGORY_COLORS, PAYMENT_TYPES, THEME colors
- Utility functions: formatCurrency, formatDate, calculatePercentage
- Web app uses @shared alias via Vite config
- Mobile app uses @shared via tsconfig paths

#### New Features (Both Web & Mobile)
1. **Budget Management**
   - Total budget for each profile
   - Category-specific budgets
   - Progress tracking with spent/remaining amounts
   - Visual progress bars
   - Over-budget warnings

2. **Data Export**
   - CSV export for Excel/Google Sheets
   - PDF export for printing/sharing (web)
   - JSON export for raw data
   - Date range selection
   - Export preview with summary

3. **Dark Mode**
   - Toggle in sidebar (web) / Settings (mobile)
   - Synced to user settings via API
   - Persistent across sessions

#### Backend Endpoints Added
- POST/GET/PUT/DELETE /api/budgets
- GET /api/budgets/progress
- GET/PUT /api/settings
- GET /api/export/csv
- GET /api/export/json

## Prioritized Backlog

### P0 (Critical) - Done
- [x] User authentication
- [x] Transaction CRUD
- [x] Dashboard analytics
- [x] Profile switching
- [x] Budget goals with progress
- [x] Data export (CSV/PDF)
- [x] Dark mode toggle

### P1 (High Priority)
- [ ] Budget notifications (when nearing limit)
- [ ] Transaction categories editing in-line
- [ ] Recurring transaction auto-creation

### P2 (Medium Priority)
- [ ] Transaction search by date range
- [ ] Transaction bulk actions (delete multiple)
- [ ] Currency preferences
- [ ] Multi-currency support

### P3 (Low Priority)
- [ ] Transaction tags
- [ ] Split transactions
- [ ] Transaction templates
- [ ] Share expense reports

## Next Tasks

1. Add budget limit notifications
2. Implement recurring transaction auto-creation
3. Add multi-currency support
4. Enhance mobile dark mode theming
