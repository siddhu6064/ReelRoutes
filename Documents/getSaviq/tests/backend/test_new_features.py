#!/usr/bin/env python3

import requests
import json
from datetime import datetime, timezone
import sys

# Base URL from frontend environment
BASE_URL = "https://expense-web-portal.preview.emergentagent.com/api"

# Test session token from registration
SESSION_TOKEN = "56c81d38-17e2-4310-9bc6-9a7fd76c35c6"
USER_ID = "user_61a320c51dea"

class NewFeaturesTest:
    def __init__(self):
        self.headers = {
            "Authorization": f"Bearer {SESSION_TOKEN}",
            "Content-Type": "application/json"
        }
        self.results = []
        self.profile_id = None
        self.category_id = None
        
    def log_result(self, test_name, success, details=""):
        status = "✅ PASS" if success else "❌ FAIL"
        self.results.append({
            "test": test_name,
            "success": success,
            "details": details
        })
        print(f"{status} {test_name}: {details}")
    
    def setup_test_data(self):
        """Get profile and category IDs for testing"""
        try:
            # Get profiles
            profiles_response = requests.get(f"{BASE_URL}/profiles", headers=self.headers)
            if profiles_response.status_code == 200:
                profiles = profiles_response.json()
                if profiles:
                    self.profile_id = profiles[0]["profile_id"]
                    
            # Get categories
            categories_response = requests.get(f"{BASE_URL}/categories", headers=self.headers)
            if categories_response.status_code == 200:
                categories = categories_response.json()
                if categories:
                    self.category_id = categories[0]["category_id"]
                    
            return self.profile_id and self.category_id
        except Exception as e:
            print(f"Setup failed: {e}")
            return False
    
    def test_budgets_api(self):
        """Test Budget API endpoints"""
        try:
            # Test POST /api/budgets - Create budget
            budget_data = {
                "profile_id": self.profile_id,
                "category_id": self.category_id,
                "amount": 500.0,
                "period": "monthly"
            }
            
            create_response = requests.post(f"{BASE_URL}/budgets", 
                                          headers=self.headers, 
                                          json=budget_data)
            
            if create_response.status_code == 200:
                budget = create_response.json()
                budget_id = budget.get("budget_id")
                self.log_result("POST /api/budgets", True, f"Created budget: ${budget.get('amount')} for {budget.get('period')}")
                
                # Test GET /api/budgets - Get all budgets
                get_response = requests.get(f"{BASE_URL}/budgets?profile_id={self.profile_id}", 
                                          headers=self.headers)
                
                if get_response.status_code == 200:
                    budgets = get_response.json()
                    if len(budgets) >= 1:
                        self.log_result("GET /api/budgets", True, f"Found {len(budgets)} budgets")
                        
                        # Test GET /api/budgets/progress - Get budget progress
                        progress_response = requests.get(f"{BASE_URL}/budgets/progress?profile_id={self.profile_id}", 
                                                       headers=self.headers)
                        
                        if progress_response.status_code == 200:
                            progress = progress_response.json()
                            if "budgets" in progress:
                                self.log_result("GET /api/budgets/progress", True, f"Budget progress loaded with {len(progress['budgets'])} items")
                                
                                # Test PUT /api/budgets/{id} - Update budget
                                update_data = {"amount": 600.0}
                                update_response = requests.put(f"{BASE_URL}/budgets/{budget_id}", 
                                                             headers=self.headers, 
                                                             json=update_data)
                                
                                if update_response.status_code == 200:
                                    updated_budget = update_response.json()
                                    self.log_result("PUT /api/budgets", True, f"Updated budget amount to ${updated_budget.get('amount')}")
                                    
                                    # Test DELETE /api/budgets/{id} - Delete budget
                                    delete_response = requests.delete(f"{BASE_URL}/budgets/{budget_id}", 
                                                                    headers=self.headers)
                                    
                                    if delete_response.status_code == 200:
                                        self.log_result("DELETE /api/budgets", True, "Budget deleted successfully")
                                        return True
                                    else:
                                        self.log_result("DELETE /api/budgets", False, f"Status {delete_response.status_code}")
                                else:
                                    self.log_result("PUT /api/budgets", False, f"Status {update_response.status_code}")
                            else:
                                self.log_result("GET /api/budgets/progress", False, "Missing 'budgets' field in response")
                        else:
                            self.log_result("GET /api/budgets/progress", False, f"Status {progress_response.status_code}")
                    else:
                        self.log_result("GET /api/budgets", False, "No budgets found after creation")
                else:
                    self.log_result("GET /api/budgets", False, f"Status {get_response.status_code}")
            else:
                self.log_result("POST /api/budgets", False, f"Status {create_response.status_code}: {create_response.text}")
                
        except Exception as e:
            self.log_result("Budget API", False, f"Exception: {str(e)}")
        return False
    
    def test_export_api(self):
        """Test Export API endpoints"""
        try:
            # Test GET /api/export/csv - Export CSV
            csv_response = requests.get(f"{BASE_URL}/export/csv?profile_id={self.profile_id}", 
                                      headers=self.headers)
            
            if csv_response.status_code == 200:
                csv_content = csv_response.text
                if "Date,Type,Description,Amount" in csv_content:
                    self.log_result("GET /api/export/csv", True, f"CSV export successful, {len(csv_content)} characters")
                    
                    # Test GET /api/export/json - Export JSON
                    json_response = requests.get(f"{BASE_URL}/export/json?profile_id={self.profile_id}", 
                                               headers=self.headers)
                    
                    if json_response.status_code == 200:
                        json_data = json_response.json()
                        required_fields = ["expenses", "summary", "category_breakdown", "period"]
                        
                        if all(field in json_data for field in required_fields):
                            summary = json_data.get("summary", {})
                            self.log_result("GET /api/export/json", True, 
                                          f"JSON export successful: {summary.get('transaction_count', 0)} transactions, "
                                          f"${summary.get('total_expense', 0)} expenses")
                            return True
                        else:
                            missing = [f for f in required_fields if f not in json_data]
                            self.log_result("GET /api/export/json", False, f"Missing fields: {missing}")
                    else:
                        self.log_result("GET /api/export/json", False, f"Status {json_response.status_code}")
                else:
                    self.log_result("GET /api/export/csv", False, "CSV header not found in response")
            else:
                self.log_result("GET /api/export/csv", False, f"Status {csv_response.status_code}: {csv_response.text}")
                
        except Exception as e:
            self.log_result("Export API", False, f"Exception: {str(e)}")
        return False
    
    def test_settings_api(self):
        """Test Settings API endpoints"""
        try:
            # Test GET /api/settings - Get user settings
            get_response = requests.get(f"{BASE_URL}/settings", headers=self.headers)
            
            if get_response.status_code == 200:
                settings = get_response.json()
                self.log_result("GET /api/settings", True, f"Settings loaded: dark_mode={settings.get('dark_mode')}, currency={settings.get('currency')}")
                
                # Test PUT /api/settings - Update settings
                update_data = {
                    "dark_mode": True,
                    "currency": "EUR"
                }
                
                update_response = requests.put(f"{BASE_URL}/settings", 
                                             headers=self.headers, 
                                             json=update_data)
                
                if update_response.status_code == 200:
                    updated_settings = update_response.json()
                    if updated_settings.get("dark_mode") == True and updated_settings.get("currency") == "EUR":
                        self.log_result("PUT /api/settings", True, f"Settings updated: dark_mode={updated_settings.get('dark_mode')}, currency={updated_settings.get('currency')}")
                        
                        # Test reverting settings
                        revert_data = {
                            "dark_mode": False,
                            "currency": "USD"
                        }
                        
                        revert_response = requests.put(f"{BASE_URL}/settings", 
                                                     headers=self.headers, 
                                                     json=revert_data)
                        
                        if revert_response.status_code == 200:
                            self.log_result("PUT /api/settings (revert)", True, "Settings reverted successfully")
                            return True
                        else:
                            self.log_result("PUT /api/settings (revert)", False, f"Status {revert_response.status_code}")
                    else:
                        self.log_result("PUT /api/settings", False, "Settings not updated correctly")
                else:
                    self.log_result("PUT /api/settings", False, f"Status {update_response.status_code}")
            else:
                self.log_result("GET /api/settings", False, f"Status {get_response.status_code}: {get_response.text}")
                
        except Exception as e:
            self.log_result("Settings API", False, f"Exception: {str(e)}")
        return False
    
    def test_auth_check(self):
        """Test authentication is working"""
        try:
            response = requests.get(f"{BASE_URL}/auth/me", headers=self.headers)
            if response.status_code == 200:
                user_data = response.json()
                if user_data.get("user_id") == USER_ID:
                    self.log_result("Authentication Check", True, f"User authenticated: {user_data.get('name')}")
                    return True
                else:
                    self.log_result("Authentication Check", False, f"Wrong user ID returned: {user_data.get('user_id')}")
            else:
                self.log_result("Authentication Check", False, f"Status {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("Authentication Check", False, f"Exception: {str(e)}")
        return False
    
    def run_all_tests(self):
        """Run all new feature tests"""
        print("=== New Features Backend API Tests ===")
        print(f"Base URL: {BASE_URL}")
        print(f"Session Token: {SESSION_TOKEN}")
        print("")
        
        # Setup test data
        if not self.setup_test_data():
            print("❌ Failed to setup test data - cannot proceed")
            return False
        
        print(f"Using Profile ID: {self.profile_id}")
        print(f"Using Category ID: {self.category_id}")
        print("")
        
        test_methods = [
            self.test_auth_check,
            self.test_budgets_api,
            self.test_export_api,
            self.test_settings_api
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
            print("🎉 All new feature tests PASSED!")
        else:
            print("⚠️  Some tests FAILED - see details above")
        
        return passed == total

def main():
    """Main test runner"""
    tester = NewFeaturesTest()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()