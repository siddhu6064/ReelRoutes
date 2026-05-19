#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime, timezone
import uuid

class ExpenseTrackerAPITester:
    def __init__(self, base_url="https://expense-web-portal.preview.emergentagent.com"):
        self.base_url = base_url
        self.session_token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_user_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        self.test_user_password = "TestPass123!"
        self.test_user_name = "Test User"
        
        # Store created resources for cleanup
        self.created_resources = {
            'profiles': [],
            'categories': [],
            'payment_methods': [],
            'expenses': []
        }

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        if details and success:
            print(f"   {details}")

    def make_request(self, method, endpoint, data=None, expected_status=200):
        """Make API request with proper headers"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if self.session_token:
            headers['Authorization'] = f'Bearer {self.session_token}'

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=data)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)
            else:
                return False, f"Unsupported method: {method}"

            success = response.status_code == expected_status
            
            if success:
                try:
                    return True, response.json()
                except:
                    return True, response.text
            else:
                try:
                    error_detail = response.json().get('detail', response.text)
                except:
                    error_detail = response.text
                return False, f"Status {response.status_code}: {error_detail}"
                
        except Exception as e:
            return False, f"Request failed: {str(e)}"

    def test_health_check(self):
        """Test basic API health"""
        success, response = self.make_request('GET', '')
        self.log_test("API Health Check", success, 
                     f"API responded: {response.get('message', 'OK')}" if success else response)
        return success

    def test_user_registration(self):
        """Test user registration"""
        data = {
            "email": self.test_user_email,
            "password": self.test_user_password,
            "name": self.test_user_name
        }
        
        success, response = self.make_request('POST', 'auth/register', data, 200)
        
        if success:
            self.session_token = response.get('session_token')
            self.user_id = response.get('user', {}).get('user_id')
            self.log_test("User Registration", True, 
                         f"User created: {response.get('user', {}).get('email')}")
        else:
            self.log_test("User Registration", False, response)
        
        return success

    def test_user_login(self):
        """Test user login"""
        data = {
            "email": self.test_user_email,
            "password": self.test_user_password
        }
        
        success, response = self.make_request('POST', 'auth/login', data, 200)
        
        if success:
            self.session_token = response.get('session_token')
            self.user_id = response.get('user', {}).get('user_id')
            self.log_test("User Login", True, 
                         f"Login successful for: {response.get('user', {}).get('email')}")
        else:
            self.log_test("User Login", False, response)
        
        return success

    def test_get_current_user(self):
        """Test getting current user info"""
        success, response = self.make_request('GET', 'auth/me')
        
        if success:
            self.log_test("Get Current User", True, 
                         f"User: {response.get('name')} ({response.get('email')})")
        else:
            self.log_test("Get Current User", False, response)
        
        return success

    def test_profiles_crud(self):
        """Test profiles CRUD operations"""
        # Get profiles
        success, profiles = self.make_request('GET', 'profiles')
        if not success:
            self.log_test("Get Profiles", False, profiles)
            return False
        
        self.log_test("Get Profiles", True, f"Found {len(profiles)} profiles")
        
        # Create profile
        profile_data = {"name": "Test Profile"}
        success, new_profile = self.make_request('POST', 'profiles', profile_data, 200)
        
        if success:
            profile_id = new_profile.get('profile_id')
            self.created_resources['profiles'].append(profile_id)
            self.log_test("Create Profile", True, f"Created profile: {new_profile.get('name')}")
            
            # Update profile
            update_data = {"name": "Updated Test Profile"}
            success, updated = self.make_request('PUT', f'profiles/{profile_id}', update_data)
            self.log_test("Update Profile", success, 
                         f"Updated to: {updated.get('name')}" if success else updated)
            
            return success
        else:
            self.log_test("Create Profile", False, new_profile)
            return False

    def test_categories_crud(self):
        """Test categories CRUD operations"""
        # Get categories
        success, categories = self.make_request('GET', 'categories')
        if not success:
            self.log_test("Get Categories", False, categories)
            return False
        
        self.log_test("Get Categories", True, f"Found {len(categories)} categories")
        
        # Create category
        category_data = {
            "name": "Test Category",
            "icon": "tag",
            "color": "#ff0000"
        }
        success, new_category = self.make_request('POST', 'categories', category_data, 200)
        
        if success:
            category_id = new_category.get('category_id')
            self.created_resources['categories'].append(category_id)
            self.log_test("Create Category", True, f"Created category: {new_category.get('name')}")
            
            # Update category
            update_data = {"name": "Updated Test Category", "color": "#00ff00"}
            success, updated = self.make_request('PUT', f'categories/{category_id}', update_data)
            self.log_test("Update Category", success, 
                         f"Updated to: {updated.get('name')}" if success else updated)
            
            return success
        else:
            self.log_test("Create Category", False, new_category)
            return False

    def test_payment_methods_crud(self):
        """Test payment methods CRUD operations"""
        # Get payment methods
        success, payments = self.make_request('GET', 'payment-methods')
        if not success:
            self.log_test("Get Payment Methods", False, payments)
            return False
        
        self.log_test("Get Payment Methods", True, f"Found {len(payments)} payment methods")
        
        # Create payment method
        payment_data = {
            "name": "Test Credit Card",
            "type": "credit_card",
            "last_four": "1234",
            "is_default": False
        }
        success, new_payment = self.make_request('POST', 'payment-methods', payment_data, 200)
        
        if success:
            payment_id = new_payment.get('payment_id')
            self.created_resources['payment_methods'].append(payment_id)
            self.log_test("Create Payment Method", True, f"Created payment: {new_payment.get('name')}")
            
            # Update payment method
            update_data = {"name": "Updated Test Card", "last_four": "5678"}
            success, updated = self.make_request('PUT', f'payment-methods/{payment_id}', update_data)
            self.log_test("Update Payment Method", success, 
                         f"Updated to: {updated.get('name')}" if success else updated)
            
            return success
        else:
            self.log_test("Create Payment Method", False, new_payment)
            return False

    def test_expenses_crud(self):
        """Test expenses/transactions CRUD operations"""
        # Get profiles and payment methods for creating expense
        success, profiles = self.make_request('GET', 'profiles')
        if not success or not profiles:
            self.log_test("Get Profiles for Expense", False, "No profiles available")
            return False
        
        success, payments = self.make_request('GET', 'payment-methods')
        if not success or not payments:
            self.log_test("Get Payment Methods for Expense", False, "No payment methods available")
            return False
        
        profile_id = profiles[0].get('profile_id')
        payment_id = payments[0].get('payment_id')
        
        # Create expense
        expense_data = {
            "profile_id": profile_id,
            "type": "expense",
            "amount": 25.50,
            "payment_method_id": payment_id,
            "description": "Test Expense",
            "merchant": "Test Store",
            "date": datetime.now(timezone.utc).isoformat(),
            "is_pending": False
        }
        
        success, new_expense = self.make_request('POST', 'expenses', expense_data, 200)
        
        if success:
            expense_id = new_expense.get('expense_id')
            self.created_resources['expenses'].append(expense_id)
            self.log_test("Create Expense", True, 
                         f"Created expense: ${new_expense.get('amount')} - {new_expense.get('description')}")
            
            # Get single expense
            success, expense = self.make_request('GET', f'expenses/{expense_id}')
            self.log_test("Get Single Expense", success, 
                         f"Retrieved: {expense.get('description')}" if success else expense)
            
            # Get all expenses
            success, expenses = self.make_request('GET', 'expenses')
            self.log_test("Get All Expenses", success, 
                         f"Found {len(expenses)} expenses" if success else expenses)
            
            # Update expense
            update_data = {"description": "Updated Test Expense", "amount": 30.00}
            success, updated = self.make_request('PUT', f'expenses/{expense_id}', update_data)
            self.log_test("Update Expense", success, 
                         f"Updated: ${updated.get('amount')} - {updated.get('description')}" if success else updated)
            
            return success
        else:
            self.log_test("Create Expense", False, new_expense)
            return False

    def test_stats_endpoints(self):
        """Test statistics endpoints"""
        # Get expense summary
        success, summary = self.make_request('GET', 'stats/summary')
        if success:
            self.log_test("Get Expense Summary", True, 
                         f"Total: ${summary.get('total', 0)}, Count: {summary.get('count', 0)}")
        else:
            self.log_test("Get Expense Summary", False, summary)
        
        # Get insights
        success, insights = self.make_request('GET', 'insights')
        if success:
            insight_count = len(insights.get('insights', []))
            self.log_test("Get AI Insights", True, f"Generated {insight_count} insights")
        else:
            self.log_test("Get AI Insights", False, insights)
        
        # Get weekly summary
        success, weekly = self.make_request('GET', 'stats/weekly-summary')
        if success:
            self.log_test("Get Weekly Summary", True, 
                         f"This week: ${weekly.get('this_week_total', 0)}")
        else:
            self.log_test("Get Weekly Summary", False, weekly)
        
        return True

    def cleanup_resources(self):
        """Clean up created test resources"""
        print("\n🧹 Cleaning up test resources...")
        
        # Delete expenses
        for expense_id in self.created_resources['expenses']:
            success, _ = self.make_request('DELETE', f'expenses/{expense_id}', expected_status=200)
            if success:
                print(f"   Deleted expense: {expense_id}")
        
        # Delete payment methods
        for payment_id in self.created_resources['payment_methods']:
            success, _ = self.make_request('DELETE', f'payment-methods/{payment_id}', expected_status=200)
            if success:
                print(f"   Deleted payment method: {payment_id}")
        
        # Delete categories (skip default ones)
        for category_id in self.created_resources['categories']:
            success, _ = self.make_request('DELETE', f'categories/{category_id}', expected_status=200)
            if success:
                print(f"   Deleted category: {category_id}")
        
        # Delete profiles (skip default ones)
        for profile_id in self.created_resources['profiles']:
            success, _ = self.make_request('DELETE', f'profiles/{profile_id}', expected_status=200)
            if success:
                print(f"   Deleted profile: {profile_id}")

    def test_logout(self):
        """Test user logout"""
        success, response = self.make_request('POST', 'auth/logout')
        self.log_test("User Logout", success, "Session terminated" if success else response)
        return success

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting SAVIQ API Tests")
        print(f"Testing against: {self.base_url}")
        print("=" * 50)
        
        try:
            # Basic tests
            if not self.test_health_check():
                print("❌ API is not responding. Stopping tests.")
                return False
            
            # Authentication tests
            if not self.test_user_registration():
                print("❌ User registration failed. Stopping tests.")
                return False
            
            if not self.test_get_current_user():
                print("❌ Authentication check failed. Stopping tests.")
                return False
            
            # CRUD tests
            self.test_profiles_crud()
            self.test_categories_crud()
            self.test_payment_methods_crud()
            self.test_expenses_crud()
            
            # Stats tests
            self.test_stats_endpoints()
            
            # Cleanup and logout
            self.cleanup_resources()
            self.test_logout()
            
        except Exception as e:
            print(f"❌ Test suite failed with error: {e}")
            return False
        
        finally:
            # Print results
            print("\n" + "=" * 50)
            print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
            
            if self.tests_passed == self.tests_run:
                print("🎉 All tests passed!")
                return True
            else:
                print(f"⚠️  {self.tests_run - self.tests_passed} tests failed")
                return False

def main():
    tester = ExpenseTrackerAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())