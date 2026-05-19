#!/usr/bin/env python3

import requests
import json
import base64
from datetime import datetime, timezone
import sys

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

class ReceiptScanningEdgeCaseTest:
    def __init__(self):
        self.session_token = None
        self.headers = {"Content-Type": "application/json"}
        
    def setup_auth(self):
        """Setup authentication"""
        try:
            login_data = {
                "email": "expense.test@example.com",
                "password": "testpass123"
            }
            
            response = requests.post(f"{BASE_URL}/auth/login", json=login_data)
            if response.status_code == 200:
                auth_data = response.json()
                self.session_token = auth_data.get("session_token")
                self.headers["Authorization"] = f"Bearer {self.session_token}"
                print("✅ Authentication successful")
                return True
            else:
                print(f"❌ Authentication failed: {response.status_code}")
        except Exception as e:
            print(f"❌ Authentication error: {str(e)}")
        return False
    
    def test_invalid_image_data(self):
        """Test receipt scanning with invalid image data"""
        print("\n=== Testing Invalid Image Data ===")
        
        # Test 1: Invalid base64
        try:
            scan_data = {"image": "invalid_base64_data"}
            response = requests.post(f"{BASE_URL}/scan-receipt", headers=self.headers, json=scan_data)
            print(f"Invalid base64: Status {response.status_code}")
            if response.status_code == 500:
                print("✅ Correctly handles invalid base64")
            else:
                print("⚠️  Unexpected response to invalid base64")
        except Exception as e:
            print(f"❌ Exception with invalid base64: {str(e)}")
        
        # Test 2: Empty image
        try:
            scan_data = {"image": ""}
            response = requests.post(f"{BASE_URL}/scan-receipt", headers=self.headers, json=scan_data)
            print(f"Empty image: Status {response.status_code}")
        except Exception as e:
            print(f"❌ Exception with empty image: {str(e)}")
        
        # Test 3: Missing image field
        try:
            scan_data = {}
            response = requests.post(f"{BASE_URL}/scan-receipt", headers=self.headers, json=scan_data)
            print(f"Missing image field: Status {response.status_code}")
        except Exception as e:
            print(f"❌ Exception with missing image field: {str(e)}")
    
    def test_different_image_formats(self):
        """Test with different image format prefixes"""
        print("\n=== Testing Different Image Formats ===")
        
        # Simple 1x1 pixel images in different formats
        test_images = {
            "PNG with data URI": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
            "JPEG with data URI": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A8A",
            "Base64 without prefix": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
        }
        
        for format_name, image_data in test_images.items():
            try:
                scan_data = {"image": image_data}
                response = requests.post(f"{BASE_URL}/scan-receipt", headers=self.headers, json=scan_data)
                print(f"{format_name}: Status {response.status_code}")
                if response.status_code == 200:
                    result = response.json()
                    print(f"  ✅ Success - Confidence: {result.get('confidence', 'N/A')}")
                else:
                    print(f"  ⚠️  Failed - {response.text[:100]}")
            except Exception as e:
                print(f"  ❌ Exception with {format_name}: {str(e)}")
    
    def run_tests(self):
        """Run all edge case tests"""
        print("=== AI Receipt Scanning Edge Case Tests ===")
        print(f"Base URL: {BASE_URL}")
        
        if not self.setup_auth():
            print("❌ Cannot run tests without authentication")
            return False
        
        self.test_invalid_image_data()
        self.test_different_image_formats()
        
        print("\n=== Edge Case Testing Complete ===")
        return True

def main():
    tester = ReceiptScanningEdgeCaseTest()
    tester.run_tests()

if __name__ == "__main__":
    main()