#!/bin/bash

# 1. Login
echo "Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -d '{"username":"admin", "password":"password"}' http://localhost:3000/login)
TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | grep -o '[^"]*$')

if [ -z "$TOKEN" ]; then
  echo "Login failed"
  exit 1
fi

echo "Token received"

# 2. Post Annotations
echo "Posting annotations..."
curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '[{"x":10,"y":10,"width":100,"height":100}]' http://localhost:3000/api/annotations
echo ""

# 3. Get Annotations
echo "Getting annotations..."
GET_RESPONSE=$(curl -s -X GET -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/annotations)
echo "Response: $GET_RESPONSE"

if [[ "$GET_RESPONSE" == *'"x":10'* ]]; then
  echo "Verification SUCCESS"
else
  echo "Verification FAILED"
fi
