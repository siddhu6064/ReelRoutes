#!/usr/bin/env python3

import requests
import json
from datetime import datetime, timezone
import sys

# Base URL from frontend environment
BASE_URL = "https://expense-web-portal.preview.emergentagent.com/api"

# Test session token created in MongoDB
SESSION_TOKEN = "test_session_1772343718072"
USER_ID = "test-user-1772343718072"

class ExpenseTrackerTest:
    def __init__(self):
        self.headers = {
            "Authorization": f"Bearer {SESSION_TOKEN}",
            "Content-Type": "application/json"
        }
        self.results = []
        
    def log_result(self, test_name, success, details=""):
        status = "✅ PASS" if success else "❌ FAIL"
        self.results.append({
            "test": test_name,
            "success": success,
            "details": details
        })
        print(f"{status} {test_name}: {details}")
    
    def test_auth_me(self):
        """Test GET /api/auth/me"""
        try:
            response = requests.get(f"{BASE_URL}/auth/me", headers=self.headers)
            if response.status_code == 200:
                user_data = response.json()
                if user_data.get("user_id") == USER_ID:
                    self.log_result("GET /auth/me", True, f"User authenticated: {user_data.get('name')}")
                    return True
                else:
                    self.log_result("GET /auth/me", False, f"Wrong user ID returned: {user_data.get('user_id')}")
            else:
                self.log_result("GET /auth/me", False, f"Status {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("GET /auth/me", False, f"Exception: {str(e)}")
        return False
    
    def test_profiles(self):
        """Test Profile endpoints"""
        try:
            # GET profiles
            response = requests.get(f"{BASE_URL}/profiles", headers=self.headers)
            if response.status_code == 200:
                profiles = response.json()
                if len(profiles) >= 2:
                    profile_names = [p.get("name") for p in profiles]
                    if "Personal" in profile_names and "Business" in profile_names:
                        self.log_result("GET /profiles", True, f"Found {len(profiles)} profiles: {profile_names}")
                        
                        # Test creating a new profile
                        create_data = {"name": "Test Profile"}
                        create_response = requests.post(f"{BASE_URL}/profiles", 
                                                      headers=self.headers, 
                                                      json=create_data)
                        if create_response.status_code == 200:
                            new_profile = create_response.json()
                            self.log_result("POST /profiles", True, f"Created profile: {new_profile.get('name')}")
                            return True
                        else:
                            self.log_result("POST /profiles", False, f"Status {create_response.status_code}")
                    else:
                        self.log_result("GET /profiles", False, f"Missing default profiles. Found: {profile_names}")
                else:
                    self.log_result("GET /profiles", False, f"Only {len(profiles)} profiles found")
            else:
                self.log_result("GET /profiles", False, f"Status {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("Profiles API", False, f"Exception: {str(e)}")
        return False
    
    def test_categories(self):
        """Test Category endpoints"""
        try:
            # GET categories
            response = requests.get(f"{BASE_URL}/categories", headers=self.headers)
            if response.status_code == 200:
                categories = response.json()
                if len(categories) >= 2:
                    default_cats = [c for c in categories if c.get("is_default")]
                    self.log_result("GET /categories", True, f"Found {len(categories)} categories, {len(default_cats)} defaults")
                    
                    # Test creating a custom category
                    create_data = {
                        "name": "Test Category",
                        "color": "#3b82f6",
                        "icon": "test"
                    }
                    create_response = requests.post(f"{BASE_URL}/categories",
                                                  headers=self.headers,
                                                  json=create_data)
                    if create_response.status_code == 200:
                        new_cat = create_response.json()
                        self.log_result("POST /categories", True, f"Created category: {new_cat.get('name')}")
                        
                        # Test deleting the custom category (should work)
                        cat_id = new_cat.get("category_id")
                        if cat_id:
                            delete_response = requests.delete(f"{BASE_URL}/categories/{cat_id}",
                                                            headers=self.headers)
                            if delete_response.status_code == 200:
                                self.log_result("DELETE /categories", True, "Custom category deleted")
                                return True
                            else:
                                self.log_result("DELETE /categories", False, f"Status {delete_response.status_code}")
                        else:
                            self.log_result("DELETE /categories", False, "No category_id in response")
                    else:
                        self.log_result("POST /categories", False, f"Status {create_response.status_code}")
                else:
                    self.log_result("GET /categories", False, f"Only {len(categories)} categories found")
            else:
                self.log_result("GET /categories", False, f"Status {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("Categories API", False, f"Exception: {str(e)}")
        return False
    
    def test_payment_methods(self):
        """Test Payment Method endpoints"""
        try:
            # GET payment methods
            response = requests.get(f"{BASE_URL}/payment-methods", headers=self.headers)
            if response.status_code == 200:
                payment_methods = response.json()
                if len(payment_methods) >= 2:
                    default_pms = [p for p in payment_methods if p.get("is_default")]
                    self.log_result("GET /payment-methods", True, f"Found {len(payment_methods)} payment methods")
                    
                    # Test creating a new payment method
                    create_data = {
                        "name": "Test Credit Card",
                        "type": "credit_card",
                        "last_four": "1234",
                        "is_default": False
                    }
                    create_response = requests.post(f"{BASE_URL}/payment-methods",
                                                  headers=self.headers,
                                                  json=create_data)
                    if create_response.status_code == 200:
                        new_pm = create_response.json()
                        self.log_result("POST /payment-methods", True, f"Created payment method: {new_pm.get('name')}")
                        
                        # Test deleting the payment method
                        pm_id = new_pm.get("payment_id")
                        if pm_id:
                            delete_response = requests.delete(f"{BASE_URL}/payment-methods/{pm_id}",
                                                            headers=self.headers)
                            if delete_response.status_code == 200:
                                self.log_result("DELETE /payment-methods", True, "Payment method deleted")
                                return True
                            else:
                                self.log_result("DELETE /payment-methods", False, f"Status {delete_response.status_code}")
                        else:
                            self.log_result("DELETE /payment-methods", False, "No payment_id in response")
                    else:
                        self.log_result("POST /payment-methods", False, f"Status {create_response.status_code}")
                else:
                    self.log_result("GET /payment-methods", False, f"Only {len(payment_methods)} payment methods found")
            else:
                self.log_result("GET /payment-methods", False, f"Status {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("Payment Methods API", False, f"Exception: {str(e)}")
        return False
    
    def test_expenses(self):
        """Test Expense endpoints"""
        try:
            # First get categories and payment methods for creating expense
            cats_response = requests.get(f"{BASE_URL}/categories", headers=self.headers)
            pms_response = requests.get(f"{BASE_URL}/payment-methods", headers=self.headers)
            
            if cats_response.status_code != 200 or pms_response.status_code != 200:
                self.log_result("Expenses API", False, "Failed to get categories or payment methods")
                return False
            
            categories = cats_response.json()
            payment_methods = pms_response.json()
            
            if not categories or not payment_methods:
                self.log_result("Expenses API", False, "No categories or payment methods available")
                return False
            
            # Create an expense
            expense_data = {
                "profile_id": "profile_personal",
                "amount": 25.50,
                "category_id": categories[0]["category_id"],
                "payment_method_id": payment_methods[0]["payment_id"],
                "description": "Test Lunch",
                "merchant": "Test Restaurant",
                "date": datetime.now(timezone.utc).isoformat()
            }
            
            create_response = requests.post(f"{BASE_URL}/expenses",
                                          headers=self.headers,
                                          json=expense_data)
            
            if create_response.status_code == 200:
                expense = create_response.json()
                expense_id = expense.get("expense_id")
                self.log_result("POST /expenses", True, f"Created expense: ${expense.get('amount')} at {expense.get('merchant')}")
                
                # Test GET expenses list
                list_response = requests.get(f"{BASE_URL}/expenses?profile_id=profile_personal",
                                           headers=self.headers)
                if list_response.status_code == 200:
                    expenses = list_response.json()
                    if len(expenses) >= 1:
                        self.log_result("GET /expenses", True, f"Found {len(expenses)} expenses")
                        
                        # Test GET single expense
                        single_response = requests.get(f"{BASE_URL}/expenses/{expense_id}",
                                                     headers=self.headers)
                        if single_response.status_code == 200:
                            single_expense = single_response.json()
                            self.log_result("GET /expenses/{id}", True, f"Retrieved expense: {single_expense.get('description')}")
                            
                            # Test UPDATE expense
                            update_data = {
                                "description": "Updated Test Lunch",
                                "amount": 30.00
                            }
                            update_response = requests.put(f"{BASE_URL}/expenses/{expense_id}",
                                                         headers=self.headers,
                                                         json=update_data)
                            if update_response.status_code == 200:
                                updated_expense = update_response.json()
                                self.log_result("PUT /expenses", True, f"Updated expense: ${updated_expense.get('amount')}")
                                
                                # Test DELETE expense
                                delete_response = requests.delete(f"{BASE_URL}/expenses/{expense_id}",
                                                                headers=self.headers)
                                if delete_response.status_code == 200:
                                    self.log_result("DELETE /expenses", True, "Expense deleted")
                                    return True
                                else:
                                    self.log_result("DELETE /expenses", False, f"Status {delete_response.status_code}")
                            else:
                                self.log_result("PUT /expenses", False, f"Status {update_response.status_code}")
                        else:
                            self.log_result("GET /expenses/{id}", False, f"Status {single_response.status_code}")
                    else:
                        self.log_result("GET /expenses", False, "No expenses found after creation")
                else:
                    self.log_result("GET /expenses", False, f"Status {list_response.status_code}")
            else:
                self.log_result("POST /expenses", False, f"Status {create_response.status_code}: {create_response.text}")
        except Exception as e:
            self.log_result("Expenses API", False, f"Exception: {str(e)}")
        return False
    
    def test_stats(self):
        """Test Stats endpoint"""
        try:
            response = requests.get(f"{BASE_URL}/stats/summary?profile_id=profile_personal&period=month",
                                  headers=self.headers)
            if response.status_code == 200:
                stats = response.json()
                required_fields = ["total", "count", "average", "period", "by_category"]
                if all(field in stats for field in required_fields):
                    self.log_result("GET /stats/summary", True, f"Stats: total=${stats.get('total')}, count={stats.get('count')}")
                    return True
                else:
                    missing = [f for f in required_fields if f not in stats]
                    self.log_result("GET /stats/summary", False, f"Missing fields: {missing}")
            else:
                self.log_result("GET /stats/summary", False, f"Status {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("GET /stats/summary", False, f"Exception: {str(e)}")
        return False
    
    def run_all_tests(self):
        """Run all backend API tests"""
        print("=== SAVIQ Backend API Tests ===")
        print(f"Base URL: {BASE_URL}")
        print(f"Session Token: {SESSION_TOKEN}")
        print("")
        
        test_methods = [
            self.test_auth_me,
            self.test_profiles,
            self.test_categories,
            self.test_payment_methods,
            self.test_expenses,
            self.test_stats
        ]
        
        passed = 0
        total = len(test_methods)
        
        for test_method in test_methods:
            if test_method():
                passed += 1
            print("")  # Add spacing between tests
        
        print("=== Test Summary ===")
        print(f"Passed: {passed}/{total}")
        print(f"Success Rate: {(passed/total)*100:.1f}%")
        
        if passed == total:
            print("🎉 All backend tests PASSED!")
        else:
            print("⚠️  Some tests FAILED - see details above")
        
        return passed == total

def main():
    """Main test runner"""
    tester = ExpenseTrackerTest()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()