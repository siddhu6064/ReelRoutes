#!/usr/bin/env python3

import requests
import json
import base64
from datetime import datetime, timezone
import sys
import os

# Get backend URL from frontend environment
def get_backend_url():
    try:
        with open('/app/frontend/.env', 'r') as f:
            for line in f:
                if line.startswith('EXPO_PUBLIC_BACKEND_URL='):
                    return line.split('=')[1].strip()
    except:
        pass
    return "http://localhost:8001"

BASE_URL = f"{get_backend_url()}/api"

class ExpenseTrackerUpdatedTest:
    def __init__(self):
        self.session_token = None
        self.user_id = None
        self.headers = {"Content-Type": "application/json"}
        self.results = []
        self.profile_id = None
        self.category_id = None
        self.payment_method_id = None
        
    def log_result(self, test_name, success, details=""):
        status = "✅ PASS" if success else "❌ FAIL"
        self.results.append({
            "test": test_name,
            "success": success,
            "details": details
        })
        print(f"{status} {test_name}: {details}")
    
    def setup_auth(self):
        """Setup authentication by registering and logging in a test user"""
        try:
            # Register a test user
            register_data = {
                "email": "expense.test@example.com",
                "password": "testpass123",
                "name": "Expense Test User"
            }
            
            response = requests.post(f"{BASE_URL}/auth/register", json=register_data)
            
            if response.status_code == 200:
                auth_data = response.json()
                self.session_token = auth_data.get("session_token")
                self.user_id = auth_data.get("user", {}).get("user_id")
                self.headers["Authorization"] = f"Bearer {self.session_token}"
                self.log_result("User Registration", True, f"Registered user: {self.user_id}")
                return True
            elif response.status_code == 400 and "already registered" in response.text:
                # User exists, try to login
                login_data = {
                    "email": "expense.test@example.com",
                    "password": "testpass123"
                }
                
                login_response = requests.post(f"{BASE_URL}/auth/login", json=login_data)
                if login_response.status_code == 200:
                    auth_data = login_response.json()
                    self.session_token = auth_data.get("session_token")
                    self.user_id = auth_data.get("user", {}).get("user_id")
                    self.headers["Authorization"] = f"Bearer {self.session_token}"
                    self.log_result("User Login", True, f"Logged in user: {self.user_id}")
                    return True
                else:
                    self.log_result("User Login", False, f"Status {login_response.status_code}: {login_response.text}")
            else:
                self.log_result("User Registration", False, f"Status {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("Authentication Setup", False, f"Exception: {str(e)}")
        return False
    
    def setup_test_data(self):
        """Get profile, category, and payment method IDs for testing"""
        try:
            # Get profiles
            profiles_response = requests.get(f"{BASE_URL}/profiles", headers=self.headers)
            if profiles_response.status_code == 200:
                profiles = profiles_response.json()
                personal_profile = next((p for p in profiles if p.get("name") == "Personal"), None)
                if personal_profile:
                    self.profile_id = personal_profile["profile_id"]
                    self.log_result("Get Profile ID", True, f"Profile ID: {self.profile_id}")
                else:
                    self.log_result("Get Profile ID", False, "No Personal profile found")
                    return False
            else:
                self.log_result("Get Profile ID", False, f"Status {profiles_response.status_code}")
                return False
            
            # Get categories
            categories_response = requests.get(f"{BASE_URL}/categories", headers=self.headers)
            if categories_response.status_code == 200:
                categories = categories_response.json()
                if categories:
                    self.category_id = categories[0]["category_id"]
                    self.log_result("Get Category ID", True, f"Category ID: {self.category_id}")
                else:
                    self.log_result("Get Category ID", False, "No categories found")
                    return False
            else:
                self.log_result("Get Category ID", False, f"Status {categories_response.status_code}")
                return False
            
            # Get payment methods
            payment_methods_response = requests.get(f"{BASE_URL}/payment-methods", headers=self.headers)
            if payment_methods_response.status_code == 200:
                payment_methods = payment_methods_response.json()
                if payment_methods:
                    self.payment_method_id = payment_methods[0]["payment_id"]
                    self.log_result("Get Payment Method ID", True, f"Payment Method ID: {self.payment_method_id}")
                    return True
                else:
                    self.log_result("Get Payment Method ID", False, "No payment methods found")
            else:
                self.log_result("Get Payment Method ID", False, f"Status {payment_methods_response.status_code}")
        except Exception as e:
            self.log_result("Setup Test Data", False, f"Exception: {str(e)}")
        return False
    
    def test_expense_with_new_fields(self):
        """Test creating expenses with new fields: type, time, is_pending, to_payment_method_id"""
        try:
            # Test 1: Create expense with new fields (type=expense, time, is_pending)
            expense_data = {
                "profile_id": self.profile_id,
                "type": "expense",
                "amount": 45.75,
                "category_id": self.category_id,
                "payment_method_id": self.payment_method_id,
                "description": "Grocery shopping with new fields",
                "merchant": "SuperMarket Plus",
                "date": datetime.now(timezone.utc).isoformat(),
                "time": "14:30",
                "is_pending": True,
                "notes": "Testing new fields"
            }
            
            response = requests.post(f"{BASE_URL}/expenses", headers=self.headers, json=expense_data)
            if response.status_code == 200:
                expense = response.json()
                if (expense.get("type") == "expense" and 
                    expense.get("time") == "14:30" and 
                    expense.get("is_pending") == True):
                    self.log_result("Create Expense with New Fields", True, 
                                  f"Created expense with type={expense.get('type')}, time={expense.get('time')}, is_pending={expense.get('is_pending')}")
                else:
                    self.log_result("Create Expense with New Fields", False, 
                                  f"New fields not saved correctly: type={expense.get('type')}, time={expense.get('time')}, is_pending={expense.get('is_pending')}")
                    return False
            else:
                self.log_result("Create Expense with New Fields", False, f"Status {response.status_code}: {response.text}")
                return False
            
            # Test 2: Create income type expense
            income_data = {
                "profile_id": self.profile_id,
                "type": "income",
                "amount": 2500.00,
                "payment_method_id": self.payment_method_id,
                "description": "Freelance payment",
                "date": datetime.now(timezone.utc).isoformat(),
                "time": "09:00",
                "is_pending": False
            }
            
            income_response = requests.post(f"{BASE_URL}/expenses", headers=self.headers, json=income_data)
            if income_response.status_code == 200:
                income = income_response.json()
                if income.get("type") == "income" and income.get("category_id") is None:
                    self.log_result("Create Income without Category", True, 
                                  f"Created income: ${income.get('amount')}, category_id={income.get('category_id')}")
                else:
                    self.log_result("Create Income without Category", False, 
                                  f"Income creation failed: type={income.get('type')}, category_id={income.get('category_id')}")
                    return False
            else:
                self.log_result("Create Income without Category", False, f"Status {income_response.status_code}: {income_response.text}")
                return False
            
            # Test 3: Create transfer type expense
            transfer_data = {
                "profile_id": self.profile_id,
                "type": "transfer",
                "amount": 100.00,
                "payment_method_id": self.payment_method_id,
                "to_payment_method_id": self.payment_method_id,  # Transfer to same method for testing
                "description": "Transfer between accounts",
                "date": datetime.now(timezone.utc).isoformat(),
                "is_pending": False
            }
            
            transfer_response = requests.post(f"{BASE_URL}/expenses", headers=self.headers, json=transfer_data)
            if transfer_response.status_code == 200:
                transfer = transfer_response.json()
                if (transfer.get("type") == "transfer" and 
                    transfer.get("to_payment_method_id") == self.payment_method_id):
                    self.log_result("Create Transfer Expense", True, 
                                  f"Created transfer: ${transfer.get('amount')}, to_payment_method_id={transfer.get('to_payment_method_id')}")
                    return True
                else:
                    self.log_result("Create Transfer Expense", False, 
                                  f"Transfer creation failed: type={transfer.get('type')}, to_payment_method_id={transfer.get('to_payment_method_id')}")
            else:
                self.log_result("Create Transfer Expense", False, f"Status {transfer_response.status_code}: {transfer_response.text}")
            
        except Exception as e:
            self.log_result("Expense New Fields Test", False, f"Exception: {str(e)}")
        return False
    
    def test_expense_backward_compatibility(self):
        """Test that old expense creation still works (backward compatibility)"""
        try:
            # Create expense with minimal fields (old style)
            old_style_data = {
                "profile_id": self.profile_id,
                "amount": 12.50,
                "category_id": self.category_id,
                "payment_method_id": self.payment_method_id,
                "description": "Old style expense",
                "date": datetime.now(timezone.utc).isoformat()
            }
            
            response = requests.post(f"{BASE_URL}/expenses", headers=self.headers, json=old_style_data)
            if response.status_code == 200:
                expense = response.json()
                # Check defaults are applied
                if (expense.get("type") == "expense" and  # Default type
                    expense.get("is_pending") == False and  # Default is_pending
                    expense.get("time") is None and  # Optional field
                    expense.get("to_payment_method_id") is None):  # Optional field
                    self.log_result("Backward Compatibility", True, 
                                  f"Old style expense created with defaults: type={expense.get('type')}, is_pending={expense.get('is_pending')}")
                    return True
                else:
                    self.log_result("Backward Compatibility", False, 
                                  f"Defaults not applied correctly: type={expense.get('type')}, is_pending={expense.get('is_pending')}")
            else:
                self.log_result("Backward Compatibility", False, f"Status {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("Backward Compatibility Test", False, f"Exception: {str(e)}")
        return False
    
    def create_test_image(self):
        """Create a simple test image as base64"""
        try:
            # Create a simple 100x100 PNG image with some visual content
            from PIL import Image, ImageDraw
            import io
            
            # Create image with gradient and text
            img = Image.new('RGB', (100, 100), color='white')
            draw = ImageDraw.Draw(img)
            
            # Add some visual features (not uniform)
            draw.rectangle([10, 10, 90, 90], outline='black', width=2)
            draw.rectangle([20, 20, 80, 80], fill='lightblue')
            draw.text((25, 40), "RECEIPT", fill='black')
            draw.text((25, 55), "$25.99", fill='red')
            
            # Convert to base64
            buffer = io.BytesIO()
            img.save(buffer, format='PNG')
            img_data = buffer.getvalue()
            base64_img = base64.b64encode(img_data).decode('utf-8')
            
            return f"data:image/png;base64,{base64_img}"
        except ImportError:
            # Fallback: create a minimal base64 image manually
            # This is a 1x1 red pixel PNG
            minimal_png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
            return f"data:image/png;base64,{minimal_png}"
    
    def test_ai_receipt_scanning(self):
        """Test the AI receipt scanning endpoint"""
        try:
            # Create test image
            test_image = self.create_test_image()
            
            # Test the scan-receipt endpoint
            scan_data = {
                "image": test_image
            }
            
            response = requests.post(f"{BASE_URL}/scan-receipt", headers=self.headers, json=scan_data)
            
            if response.status_code == 200:
                result = response.json()
                
                # Check required fields are present
                required_fields = ["amount", "merchant", "date", "time", "category_suggestion", "items", "confidence"]
                missing_fields = [field for field in required_fields if field not in result]
                
                if not missing_fields:
                    self.log_result("AI Receipt Scanning", True, 
                                  f"Scan successful: amount={result.get('amount')}, merchant={result.get('merchant')}, confidence={result.get('confidence')}")
                    
                    # Validate field types
                    confidence = result.get('confidence')
                    if isinstance(confidence, (int, float)) and 0 <= confidence <= 1:
                        self.log_result("Receipt Scan Confidence", True, f"Valid confidence score: {confidence}")
                    else:
                        self.log_result("Receipt Scan Confidence", False, f"Invalid confidence score: {confidence}")
                    
                    category_suggestion = result.get('category_suggestion')
                    valid_categories = ["Food & Dining", "Transportation", "Shopping", "Bills & Utilities", 
                                      "Entertainment", "Healthcare", "Travel", "Education", "Other"]
                    if category_suggestion in valid_categories:
                        self.log_result("Receipt Category Suggestion", True, f"Valid category: {category_suggestion}")
                        return True
                    else:
                        self.log_result("Receipt Category Suggestion", False, f"Invalid category: {category_suggestion}")
                else:
                    self.log_result("AI Receipt Scanning", False, f"Missing required fields: {missing_fields}")
            else:
                self.log_result("AI Receipt Scanning", False, f"Status {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("AI Receipt Scanning", False, f"Exception: {str(e)}")
        return False
    
    def test_ai_receipt_authentication(self):
        """Test that receipt scanning requires authentication"""
        try:
            # Test without authentication
            test_image = self.create_test_image()
            scan_data = {"image": test_image}
            
            # Remove auth header
            headers_no_auth = {"Content-Type": "application/json"}
            response = requests.post(f"{BASE_URL}/scan-receipt", headers=headers_no_auth, json=scan_data)
            
            if response.status_code == 401:
                self.log_result("Receipt Scan Auth Required", True, "Correctly requires authentication")
                return True
            else:
                self.log_result("Receipt Scan Auth Required", False, f"Should return 401, got {response.status_code}")
        except Exception as e:
            self.log_result("Receipt Scan Auth Test", False, f"Exception: {str(e)}")
        return False
    
    def run_all_tests(self):
        """Run all updated backend API tests"""
        print("=== SAVIQ Updated Backend API Tests ===")
        print(f"Base URL: {BASE_URL}")
        print("")
        
        # Setup authentication first
        if not self.setup_auth():
            print("❌ Authentication setup failed - cannot continue with tests")
            return False
        
        if not self.setup_test_data():
            print("❌ Test data setup failed - cannot continue with tests")
            return False
        
        print("")
        
        test_methods = [
            self.test_expense_with_new_fields,
            self.test_expense_backward_compatibility,
            self.test_ai_receipt_scanning,
            self.test_ai_receipt_authentication
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
            print("🎉 All updated backend tests PASSED!")
        else:
            print("⚠️  Some tests FAILED - see details above")
        
        return passed == total

def main():
    """Main test runner"""
    tester = ExpenseTrackerUpdatedTest()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()