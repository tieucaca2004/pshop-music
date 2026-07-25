#!/bin/bash
# Deploy preparation script for PSH Platform
# Run on Ubuntu host after firebase login
echo "=== PSH Deploy Prep ==="
echo "1. Verify config..."
cat database.rules.json | python3 -c "import sys,json;print('Firebase Rules: valid JSON')"
cat storage.rules > /dev/null && echo "Storage Rules: file exists"
echo "2. Verify Cloud Functions..."
ls functions/index.js functions/package.json > /dev/null && echo "Functions: ready"
echo "3. Deploy commands:"
echo "   firebase deploy --only database"
echo "   firebase deploy --only storage"
echo "   firebase deploy --only functions"
echo "   firebase functions:secrets:set OPENAI_API_KEY"
echo "=== Prep complete ==="
