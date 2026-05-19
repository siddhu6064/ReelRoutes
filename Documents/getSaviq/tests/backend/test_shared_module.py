#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

class SharedModuleAPITester:
    def __init__(self, base_url="https://expense-web-portal.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.user_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=10)

            print(f"   Status: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_auth_flow(self):
        """Test authentication to get token"""
        print("\n🔐 Testing Authentication Flow...")
        
        # Try to register a test user first
        test_email = f"test_{datetime.now().strftime('%H%M%S')}@example.com"
        test_password = "TestPass123!"
        
        success, response = self.run_test(
            "User Registration",
            "POST",
            "auth/register",
            200,
            data={
                "email": test_email,
                "password": test_password,
                "name": "Test User"
            }
        )
        
        if success:
            self.user_id = response.get('user_id')
        
        # Login to get token
        success, response = self.run_test(
            "User Login",
            "POST", 
            "auth/login",
            200,
            data={
                "email": test_email,
                "password": test_password
            }
        )
        
        if success and ('access_token' in response or 'session_token' in response):
            self.token = response.get('access_token') or response.get('session_token')
            print(f"✅ Authentication successful, token obtained")
            return True
        else:
            print(f"❌ Authentication failed")
            return False

    def test_budgets_api(self):
        """Test budget management APIs"""
        print("\n💰 Testing Budget APIs...")
        
        # First get profiles to get profile_id
        success, profiles_data = self.run_test(
            "Get Profiles",
            "GET",
            "profiles",
            200
        )
        
        profile_id = None
        if success and profiles_data:
            profile_id = profiles_data[0].get('profile_id') if profiles_data else None
        
        if not profile_id:
            print("❌ No profile found, cannot test budget APIs")
            return False
        
        # Test GET /api/budgets/progress with profile_id
        success, progress_data = self.run_test(
            "Get Budget Progress",
            "GET",
            f"budgets/progress?profile_id={profile_id}",
            200
        )
        
        if not success:
            print("❌ Budget progress API failed")
            return False
            
        # Test GET /api/budgets with profile_id
        success, budgets_data = self.run_test(
            "Get Budgets List",
            "GET", 
            f"budgets?profile_id={profile_id}",
            200
        )
        
        # Test creating a budget
        budget_data = {
            "profile_id": profile_id,
            "category_id": None,  # Total budget
            "amount": 1000.0,
            "period": "monthly"
        }
        
        success, created_budget = self.run_test(
            "Create Budget",
            "POST",
            "budgets", 
            200,
            data=budget_data
        )
        
        return success

    def test_export_api(self):
        """Test data export APIs"""
        print("\n📊 Testing Export APIs...")
        
        # First get profiles to get profile_id
        success, profiles_data = self.run_test(
            "Get Profiles for Export",
            "GET",
            "profiles",
            200
        )
        
        profile_id = None
        if success and profiles_data:
            profile_id = profiles_data[0].get('profile_id') if profiles_data else None
        
        if not profile_id:
            print("❌ No profile found, cannot test export APIs")
            return False
        
        # Test CSV export with profile_id
        success, csv_data = self.run_test(
            "Export CSV",
            "GET",
            f"export/csv?profile_id={profile_id}",
            200
        )
        
        if not success:
            print("❌ CSV export API failed")
            return False
            
        # Test JSON export with profile_id
        success, json_data = self.run_test(
            "Export JSON",
            "GET",
            f"export/json?profile_id={profile_id}", 
            200
        )
        
        return success

    def test_settings_api(self):
        """Test user settings APIs"""
        print("\n⚙️ Testing Settings APIs...")
        
        # Test GET settings
        success, settings_data = self.run_test(
            "Get User Settings",
            "GET",
            "settings",
            200
        )
        
        if not success:
            print("❌ Get settings API failed")
            return False
            
        # Test PUT settings (dark mode toggle)
        settings_update = {
            "dark_mode": True,
            "currency": "USD"
        }
        
        success, updated_settings = self.run_test(
            "Update Settings (Dark Mode)",
            "PUT",
            "settings",
            200,
            data=settings_update
        )
        
        return success

    def test_core_apis(self):
        """Test core APIs that web app depends on"""
        print("\n🏠 Testing Core APIs...")
        
        # Test categories
        success, categories = self.run_test(
            "Get Categories",
            "GET",
            "categories",
            200
        )
        
        if not success:
            return False
            
        # Test payment methods
        success, payment_methods = self.run_test(
            "Get Payment Methods", 
            "GET",
            "payment-methods",
            200
        )
        
        if not success:
            return False
            
        # Test expenses/transactions
        success, expenses = self.run_test(
            "Get Expenses",
            "GET", 
            "expenses",
            200
        )
        
        return success

def main():
    """Main test execution"""
    print("🚀 Starting Shared Module Backend API Tests")
    print("=" * 60)
    
    tester = SharedModuleAPITester()
    
    # Test authentication first
    if not tester.test_auth_flow():
        print("\n❌ Authentication failed - stopping tests")
        return 1
    
    # Test all required APIs
    tests = [
        ("Budget APIs", tester.test_budgets_api),
        ("Export APIs", tester.test_export_api), 
        ("Settings APIs", tester.test_settings_api),
        ("Core APIs", tester.test_core_apis)
    ]
    
    failed_tests = []
    
    for test_name, test_func in tests:
        try:
            if not test_func():
                failed_tests.append(test_name)
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {e}")
            failed_tests.append(test_name)
    
    # Print final results
    print("\n" + "=" * 60)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if failed_tests:
        print(f"❌ Failed test categories: {', '.join(failed_tests)}")
        return 1
    else:
        print("✅ All backend APIs working correctly!")
        return 0

if __name__ == "__main__":
    sys.exit(main())